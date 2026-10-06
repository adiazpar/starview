"""Manage MFA from settings without exposing secrets or duplicating allauth crypto."""

import base64
import time

from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.recovery_codes.internal.flows import auto_generate_recovery_codes, generate_recovery_codes, view_recovery_codes
from allauth.mfa.totp.forms import ActivateTOTPForm
from allauth.mfa.totp.internal.auth import TOTP, SECRET_SESSION_KEY, clear_totp_secret
from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework import exceptions

from starview_app.models import UserProfile
from starview_app.services.account_security import locked_account, require_recent, validate_security_payload
from starview_app.services.account_events import credential_changed
from starview_app.services.email_identity import verified_primary
from starview_app.services.mfa_policy import requires_second_factor
from starview_app.services.mfa_email import email_choices, email_destination
from starview_app.services.verification_methods import (
    verification_methods, preferred_method, send_email_challenge, verify_email_challenge,
    normalize_verification_code, check_proof_rate_limit,
)

SETUP_KEY = 'starview_totp_setup'


def complete_mfa_enrollment(request, user, authenticator):
    if authenticator.type not in ('totp', 'webauthn'):
        return
    marker = ('added', authenticator.pk)
    completed = getattr(request, '_starview_completed_mfa_changes', set())
    if marker in completed:
        return
    with transaction.atomic():
        user = user.__class__.objects.select_for_update().get(pk=user.pk)
        from allauth.account.internal.flows.login import record_authentication
        already_enabled = user.userprofile.two_factor_enabled
        updates = {'two_factor_enabled': True}
        if authenticator.type == 'totp':
            updates['two_factor_method'] = UserProfile.TwoFactorMethod.AUTHENTICATOR
            user.userprofile.two_factor_method = UserProfile.TwoFactorMethod.AUTHENTICATOR
        UserProfile.objects.filter(user=user).update(**updates)
        user.userprofile.two_factor_enabled = True
        # Keep the native request's cached profile current for the overview and
        # session version update, including inside an outer transaction.
        request.user = user
        record_authentication(request, user, 'mfa', id=authenticator.pk, type=authenticator.type)
        credential_changed(request, user, 'mfa_method_added' if already_enabled else 'mfa_enabled')
    completed.add(marker)
    request._starview_completed_mfa_changes = completed


def complete_recovery_reset(request, user, authenticator):
    marker = ('reset', authenticator.pk)
    completed = getattr(request, '_starview_completed_mfa_changes', set())
    if marker not in completed:
        credential_changed(request, user, 'mfa_recovery_reset')
        completed.add(marker)
        request._starview_completed_mfa_changes = completed


def method_status(request):
    user = request.user
    methods = verification_methods(user)
    recovery = Authenticator.objects.filter(user=user, type=Authenticator.Type.RECOVERY_CODES).first()
    return {
        'enabled': requires_second_factor(user),
        'required': False,
        'methods': methods,
        'preferred_method': preferred_method(user, methods),
        'email': email_destination(user),
        'email_choices': email_choices(user),
        'recovery_count': len(recovery.wrap().get_unused_codes()) if recovery else 0,
    }


def manage_method(request, data):
    validate_security_payload(data)
    action = data.get('action')
    invalid_email_code = False
    with locked_account(request, recent_required=False) as user:
        # Opting out or setting up an off account uses the current session.
        # Decide after locking: a concurrent enrollment must not let an old
        # off-state bypass proof for changes to an already-enabled account.
        setup_from_off = action in ('begin_totp', 'activate_totp') and not requires_second_factor(user)
        if action != 'disable' and not setup_from_off:
            require_recent(request)
        if not verified_primary(user):
            raise exceptions.PermissionDenied(_('Verify your primary email before managing two-factor authentication.'))
        if action == 'enable':
            if not any(method['id'] == 'email_code' and method['available'] for method in verification_methods(user)):
                raise exceptions.ValidationError(_('Email verification is unavailable. Connect an authenticator app instead.'))
            if not requires_second_factor(user):
                UserProfile.objects.filter(user=user).update(two_factor_enabled=True, two_factor_method=UserProfile.TwoFactorMethod.EMAIL)
                user.userprofile.two_factor_enabled = True
                user.userprofile.two_factor_method = UserProfile.TwoFactorMethod.EMAIL
                RecoveryCodes.activate(user)
                credential_changed(request, user, 'mfa_enabled')
        elif action == 'set_preferred_method':
            method = data.get('method')
            if not requires_second_factor(user):
                raise exceptions.ValidationError(_('Enable two-factor authentication before choosing your method.'))
            if method not in UserProfile.TwoFactorMethod.values or not any(
                item['id'] == method and item['available'] for item in verification_methods(user)
            ):
                raise exceptions.ValidationError(_('Choose an available email or authenticator method.'))
            # This only changes which existing method is offered first. It does
            # not add/remove credentials, revoke sessions, or refresh proof age.
            UserProfile.objects.filter(user=user).update(two_factor_method=method)
            user.userprofile.two_factor_method = method
        elif action in ('send_email_destination_code', 'set_email_destination'):
            email = data.get('email')
            if not requires_second_factor(user):
                raise exceptions.ValidationError(_('Enable two-factor authentication first.'))
            if not isinstance(email, str) or not any(
                choice['email'] == email and choice['available'] for choice in email_choices(user)
            ):
                raise exceptions.ValidationError(_('Choose an available email from your account.'))
            if email.casefold() == email_destination(user).casefold():
                raise exceptions.ValidationError(_('This is already your two-factor email.'))
            purpose = f'mfa-email:{email}'
            if action == 'send_email_destination_code':
                send_email_challenge(request, user, email, purpose)
            else:
                code = normalize_verification_code(data.get('code'))
                clear_limit = check_proof_rate_limit(user)
                invalid_email_code = not verify_email_challenge(request, user, code, email, purpose)
                if not invalid_email_code:
                    clear_limit()
                    old_email = email_destination(user)
                    selected = '' if email.casefold() == user.email.casefold() else email
                    UserProfile.objects.filter(user=user).update(two_factor_email=selected)
                    user.userprofile.two_factor_email = selected
                    credential_changed(request, user, 'mfa_email_changed', recipients=[user.email, old_email, email])
        elif action == 'disable':
            if requires_second_factor(user):
                UserProfile.objects.filter(user=user).update(two_factor_enabled=False, two_factor_email='')
                user.userprofile.two_factor_enabled = False
                user.userprofile.two_factor_email = ''
                Authenticator.objects.filter(user=user).delete()
                request.session.pop(SETUP_KEY, None)
                request.session.pop(SECRET_SESSION_KEY, None)
                credential_changed(request, user, 'mfa_disabled')
        elif action == 'begin_totp':
            if Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).exists():
                raise exceptions.ValidationError(_('An authenticator app is already connected.'))
            form = ActivateTOTPForm(user=user)
            request.session[SETUP_KEY] = {'user_id': user.pk, 'version': user.userprofile.security_version, 'at': time.time()}
            adapter = get_adapter()
            svg = adapter.build_totp_svg(adapter.build_totp_url(user, form.secret))
            return {'qr_code': 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()}
        elif action == 'activate_totp':
            setup = request.session.get(SETUP_KEY, {})
            if (setup.get('user_id') != user.pk or setup.get('version') != user.userprofile.security_version
                    or not 0 <= time.time() - setup.get('at', 0) < 600 or not request.session.get(SECRET_SESSION_KEY)):
                raise exceptions.ValidationError(_('Authenticator setup expired. Start setup again.'))
            form = ActivateTOTPForm(user=user, data={'code': normalize_verification_code(data.get('code'))})
            if not form.is_valid():
                raise exceptions.ValidationError(_('The authenticator code was not accepted.'))
            # Starview owns the enrollment policy and notification. Reuse
            # allauth's validated form, encryption, and recovery generation
            # without its page flow's separate reauthentication requirement.
            authenticator = TOTP.activate(user, form.secret).instance
            auto_generate_recovery_codes(request)
            complete_mfa_enrollment(request, user, authenticator)
            clear_totp_secret(request)
            request.session.pop(SETUP_KEY, None)
        elif action == 'remove_totp':
            auth = Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).first()
            if auth:
                if not any(method['available'] for method in verification_methods(user) if method['id'] != 'totp'):
                    raise exceptions.ValidationError(_('Set up another verification method before removing your authenticator app.'))
                # Removing a method preserves the account's existing opt-in choice.
                auth.delete()
                credential_changed(request, user, 'mfa_method_removed')
        elif action == 'regenerate_recovery':
            if not requires_second_factor(user):
                raise exceptions.ValidationError(_('Enable two-factor authentication before generating recovery codes.'))
            authenticator = generate_recovery_codes(request)
            complete_recovery_reset(request, user, authenticator)
        else:
            raise exceptions.ValidationError(_('Unknown account security action.'))
    # Commit failed attempts before returning a validation error, as with login
    # challenges. Raising inside locked_account would undo the attempt counter.
    if invalid_email_code:
        raise exceptions.ValidationError(_('The code is incorrect or has expired.'))
    return method_status(request)


def recovery_codes(request):
    # allauth marks the record as viewed; serialize that write with code use and
    # credential changes so it cannot restore a concurrently consumed code.
    with locked_account(request):
        codes, can_view = view_recovery_codes(request)
        if not codes:
            return []
        if not can_view:
            raise exceptions.PermissionDenied(_('These recovery codes can no longer be displayed. Generate new codes.'))
        return codes.get_unused_codes()
