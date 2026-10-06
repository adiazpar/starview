"""Manage MFA from settings without exposing secrets or duplicating allauth crypto."""

import base64
import time

from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.recovery_codes.internal.flows import generate_recovery_codes, view_recovery_codes
from allauth.mfa.totp.forms import ActivateTOTPForm
from allauth.mfa.totp.internal.flows import activate_totp
from allauth.mfa.totp.internal.auth import SECRET_SESSION_KEY
from django.utils.translation import gettext as _
from rest_framework import exceptions

from starview_app.models import UserProfile
from starview_app.services.account_security import locked_account, require_recent
from starview_app.services.account_events import credential_changed
from starview_app.services.email_identity import verified_primary
from starview_app.services.mfa_policy import requires_second_factor
from starview_app.services.mfa_email import email_choices, email_destination
from starview_app.services.verification_methods import (
    verification_methods, preferred_method, send_email_challenge, verify_email_challenge,
)

SETUP_KEY = 'starview_totp_setup'


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
    action = data.get('action')
    invalid_email_code = False
    with locked_account(request) as user:
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
                code = data.get('code')
                if not isinstance(code, str) or len(code) > 32:
                    raise exceptions.ValidationError(_('Enter a valid verification code.'))
                invalid_email_code = not verify_email_challenge(request, user, code.strip(), email, purpose)
                if not invalid_email_code:
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
            form = ActivateTOTPForm(user=user, data={'code': data.get('code', '')})
            if not form.is_valid():
                raise exceptions.ValidationError(_('The authenticator code was not accepted.'))
            activate_totp(request, form)
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
            generate_recovery_codes(request)
        else:
            raise exceptions.ValidationError(_('Unknown account security action.'))
    # Commit failed attempts before returning a validation error, as with login
    # challenges. Raising inside locked_account would undo the attempt counter.
    if invalid_email_code:
        raise exceptions.ValidationError(_('The code is incorrect or has expired.'))
    return method_status(request)


def recovery_codes(request):
    require_recent(request)
    codes, can_view = view_recovery_codes(request)
    if not codes:
        return []
    if not can_view:
        raise exceptions.PermissionDenied(_('These recovery codes can no longer be displayed. Generate new codes.'))
    return codes.get_unused_codes()
