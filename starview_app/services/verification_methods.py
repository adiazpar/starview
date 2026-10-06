"""Verification methods shared by sign-in, settings, and native account pages.

Delivery methods own their challenge binding and verification. Adding SMS later
requires a verified phone enrollment and a handler here, not another auth flow.
"""

import secrets
from dataclasses import dataclass
from collections.abc import Callable
from datetime import timedelta
from functools import partial

from allauth.account.internal.flows.login import record_authentication
from allauth.mfa.base.internal.flows import check_rate_limit, post_authentication
from allauth.mfa.models import Authenticator
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.contrib.sites.shortcuts import get_current_site
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.functional import Promise
from django.utils.crypto import constant_time_compare, salted_hmac
from django.utils.translation import gettext as _, gettext_lazy
from rest_framework import exceptions

from starview_app.models import AccountVerification
from starview_app.services.account_mail import enqueue_account_email
from starview_app.services.email_identity import verified_primary
from starview_app.services.apple_relay import is_apple_relay_disabled
from starview_app.services.mfa_email import email_destination, mask_email


def _digest(value, purpose):
    return salted_hmac(f'starview.account-verification.{purpose}', value, algorithm='sha256').hexdigest()


def _challenge_binding(request, user, purpose):
    return _digest(
        f'{request.session.session_key or ""}:{user.pk}:{user.userprofile.security_version}:{purpose}',
        'session',
    )


def _challenge_key(purpose):
    if purpose.startswith('mfa-email:'):
        return 'account_mfa_email_verification_id'
    return 'account_verification_id' if purpose == 'reauth' else 'account_login_verification_id'


def _email_available(user):
    return bool(verified_primary(user)) and not is_apple_relay_disabled(email_destination(user))


def _send_email(request, user, purpose):
    send_email_challenge(request, user, None, purpose)


def send_email_challenge(request, user, email, purpose):
    if not request.session.session_key:
        request.session.save()
    now = timezone.now()
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().get(pk=user.pk)
        email = email or email_destination(user)
        if not user.is_active or not verified_primary(user) or is_apple_relay_disabled(email):
            raise exceptions.PermissionDenied(_('Verify your primary email before continuing.'))
        recent = AccountVerification.objects.filter(user=user, created_at__gt=now - timedelta(hours=1))
        if recent.count() >= 3 or recent.filter(email__iexact=email, created_at__gt=now - timedelta(seconds=60)).exists():
            raise exceptions.Throttled(detail=_('Please wait before requesting another confirmation code.'))
        AccountVerification.objects.filter(user=user, used_at__isnull=True).update(used_at=now)
        code = f'{secrets.randbelow(1000000):06d}'
        challenge = AccountVerification.objects.create(
            user=user, session_digest=_challenge_binding(request, user, purpose),
            email=email, code_digest=_digest(code, purpose), expires_at=now + timedelta(minutes=10),
        )
        is_sign_in = purpose.startswith('login:')
        is_email_setup = purpose.startswith('mfa-email:')
        context = {'user': user, 'site_name': get_current_site(request).name, 'code': code, 'is_sign_in': is_sign_in, 'is_email_setup': is_email_setup}
        with translation.override(user.userprofile.language_preference):
            message = EmailMultiAlternatives(
                _('Verify your Starview two-factor email') if is_email_setup else _('Your Starview sign-in code') if is_sign_in else _('Confirm your Starview account change'),
                render_to_string('account/email/confirmation_code_message.txt', context),
                settings.DEFAULT_FROM_EMAIL, [email],
            )
            message.attach_alternative(render_to_string('account/email/confirmation_code_message.html', context), 'text/html')
        enqueue_account_email(message, user=user, expires_at=challenge.expires_at)
    request.session[_challenge_key(purpose)] = str(challenge.pk)


def _verify_email(request, user, code, purpose):
    return verify_email_challenge(request, user, code, email_destination(user), purpose)


def verify_email_challenge(request, user, code, email, purpose):
    challenge_id = request.session.get(_challenge_key(purpose))
    challenge = AccountVerification.objects.select_for_update().filter(
        pk=challenge_id, user=user,
    ).first() if challenge_id else None
    if not challenge or challenge.used_at or challenge.expires_at <= timezone.now() or challenge.attempts >= 5:
        return False
    challenge.attempts += 1
    valid = (
        len(code) == 6 and code.isascii() and code.isdigit()
        and challenge.email.casefold() == email.casefold()
        and constant_time_compare(challenge.session_digest, _challenge_binding(request, user, purpose))
        and constant_time_compare(challenge.code_digest, _digest(code, purpose))
    )
    if valid or challenge.attempts >= 5:
        challenge.used_at = timezone.now()
    challenge.save(update_fields=['attempts', 'used_at'])
    if valid:
        request.session.pop(_challenge_key(purpose), None)
    return valid


def _has_authenticator(user, auth_type):
    auth = Authenticator.objects.filter(user=user, type=auth_type).first()
    return bool(auth and (auth_type != Authenticator.Type.RECOVERY_CODES or auth.wrap().get_unused_codes()))


def _verify_authenticator(request, user, code, purpose, *, auth_type):
    auth = Authenticator.objects.filter(user=user, type=auth_type).first()
    return auth if auth and auth.wrap().validate_code(code) else False


@dataclass(frozen=True)
class VerificationMethod:
    id: str
    label: str | Promise
    available: Callable
    verify: Callable
    send: Callable | None = None


METHODS = {
    method.id: method for method in (
        VerificationMethod('email_code', gettext_lazy('Email code'), _email_available, _verify_email, _send_email),
        VerificationMethod('totp', gettext_lazy('Authenticator app'),
                           partial(_has_authenticator, auth_type=Authenticator.Type.TOTP),
                           partial(_verify_authenticator, auth_type=Authenticator.Type.TOTP)),
        VerificationMethod('recovery_codes', gettext_lazy('Backup code'),
                           partial(_has_authenticator, auth_type=Authenticator.Type.RECOVERY_CODES),
                           partial(_verify_authenticator, auth_type=Authenticator.Type.RECOVERY_CODES)),
    )
}


def verification_methods(user):
    return [
        {'id': method.id, 'label': str(method.label), 'available': bool(method.available(user)),
         'requires_delivery': method.send is not None,
         **({'destination': mask_email(email_destination(user))} if method.id == 'email_code' else {})}
        for method in METHODS.values()
    ]


def preferred_method(user, methods):
    available = {method['id'] for method in methods if method['available']}
    selected = user.userprofile.two_factor_method
    if selected in available:
        return selected
    # Never direct a user to a removed app or an unavailable mailbox.
    return 'totp' if 'totp' in available else next((item['id'] for item in methods if item['available']), None)


def send_code(request, user, method_id='email_code', *, purpose='reauth'):
    method = METHODS.get(method_id) if isinstance(method_id, str) else None
    if not method or not method.send or not method.available(user):
        raise exceptions.ValidationError(_('This verification method is not available.'))
    method.send(request, user, purpose)


def verify_code(request, user, method_id, code, *, purpose='reauth', reauthenticated=True):
    method = METHODS.get(method_id) if isinstance(method_id, str) else None
    if not method or not isinstance(code, str) or not code or len(code) > 32:
        raise exceptions.ValidationError(_('Enter a valid verification code.'))
    # Shared across methods and sign-in/reauthentication, so switching methods
    # does not reset the failed-proof budget.
    try:
        clear_limit = check_rate_limit(user)
    except ValidationError:
        raise exceptions.Throttled() from None
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().get(pk=user.pk)
        if not user.is_active or not verified_primary(user) or not method.available(user):
            raise exceptions.PermissionDenied(_('This verification method is not available.'))
        proof = method.verify(request, user, code.strip(), purpose)
    # Failed email attempts must commit before reporting an error.
    if not proof:
        raise exceptions.ValidationError(_('The code is incorrect or has expired.'))
    clear_limit()
    if isinstance(proof, Authenticator):
        post_authentication(request, proof, reauthenticated=reauthenticated)
    else:
        record_authentication(request, user, 'mfa', type=method_id, reauthenticated=reauthenticated)
