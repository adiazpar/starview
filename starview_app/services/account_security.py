"""Recent identity proof for sensitive actions, including passwordless accounts."""

import time
from contextlib import contextmanager

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import exceptions

from starview_app.models import AccountVerification
from starview_app.services.mfa_policy import requires_second_factor
from starview_app.services.verification_methods import verification_methods, preferred_method, send_code, verify_code

RECENT_AUTH_KEY = 'starview_recent_auth'


def revoke_account_sessions(user, *, keep_request=None):
    """Invalidate sessions by version, without scanning or decoding session rows."""
    from django.db.models import F
    from starview_app.models import UserProfile
    UserProfile.objects.filter(user=user).update(security_version=F('security_version') + 1)
    if keep_request is not None and keep_request.user.pk == user.pk:
        version = UserProfile.objects.values_list('security_version', flat=True).get(user=user)
        keep_request.session['identity_version'] = version
        keep_request.session.cycle_key()
        keep_request.user.userprofile.security_version = version
    AccountVerification.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())


def has_mfa(user):
    return requires_second_factor(user)


def mark_recent(request, user, method, *, mfa=False):
    request.session[RECENT_AUTH_KEY] = {
        'user_id': user.pk, 'at': time.time(), 'method': method, 'mfa': mfa,
    }


def is_recent(request):
    if not request.user.is_authenticated:
        return False
    proof = request.session.get(RECENT_AUTH_KEY, {})
    return (
        proof.get('user_id') == request.user.pk
        and 0 <= time.time() - proof.get('at', 0) < settings.ACCOUNT_REAUTHENTICATION_TIMEOUT
        and (not has_mfa(request.user) or proof.get('mfa') is True)
    )


def require_recent(request):
    if not is_recent(request):
        raise exceptions.PermissionDenied({
            'code': 'reauthentication_required',
            'detail': _('Please confirm your identity before changing your account.'),
        })


@contextmanager
def locked_account(request):
    """Recheck authority after waiting for any concurrent credential change."""
    from django.contrib.auth import get_user_model
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        if not user.is_active or request.session.get('identity_version', 0) != user.userprofile.security_version:
            raise exceptions.PermissionDenied('Your account changed. Please sign in again.')
        request.user = user
        require_recent(request)
        yield user


def security_status(request):
    mfa = has_mfa(request.user)
    methods = verification_methods(request.user)
    return {
        'recent': is_recent(request),
        'methods': methods,
        'preferred_method': preferred_method(request.user, methods),
        'method': 'mfa' if mfa else ('password' if request.user.has_usable_password() else 'email_code'),
    }


def staff_verification_url(request):
    if not request.user.is_authenticated or not request.user.is_staff or not has_mfa(request.user):
        return None
    proof = request.session.get(RECENT_AUTH_KEY, {})
    if proof.get('user_id') == request.user.pk and proof.get('mfa') is True:
        return None
    return '/accounts/reauthenticate/?next=/admin/'


def send_verification_code(request, method='email_code'):
    send_code(getattr(request, '_request', request), request.user, method)


def confirm_identity(request, data):
    native_request = getattr(request, '_request', request)
    # Existing password-change forms can reuse entered proof for accounts that
    # have not enabled two-step sign-in. The modal offers the code methods.
    if 'password' in data and not has_mfa(request.user):
        password = data.get('password', '')
        if not isinstance(password, str) or not password:
            raise exceptions.ValidationError(_('Enter your current password.'))
        user = authenticate(request=native_request, username=request.user.username, password=password)
        if user is None or user.pk != request.user.pk:
            raise exceptions.ValidationError(_('The password was not accepted.'))
        mark_recent(request, user, 'password')
        from allauth.account.internal.flows.reauthentication import reauthenticate_by_password
        reauthenticate_by_password(native_request)
        return
    method = data.get('method')
    if method is None:
        # Compatibility for existing native forms; new callers name the method.
        if request.session.get('account_verification_id'):
            method = 'email_code'
        elif has_mfa(request.user):
            code = data.get('code', '')
            method = 'totp' if isinstance(code, str) and len(code) == 6 else 'recovery_codes'
        else:
            method = 'email_code'
    verify_code(native_request, request.user, method, data.get('code', ''))
    mark_recent(request, request.user, method, mfa=True)
