"""OAuth lifecycle hooks shared by Google and Apple."""

import logging
from django.conf import settings
from django.contrib.auth.signals import user_logged_in as django_user_logged_in
from django.db import transaction
from django.dispatch import receiver
from allauth.account.signals import user_logged_in, user_signed_up, authentication_step_completed
from allauth.socialaccount.signals import social_account_added, social_account_updated, social_account_removed
from starview_app.services.apple_oauth import store_apple_credential
from starview_app.services.account_events import credential_changed
from starview_app.utils.audit_logger import log_auth_event

logger = logging.getLogger(__name__)


def audit_oauth(request, event_type, *, user=None, provider, success=True, reason=None):
    if settings.DEBUG:
        return
    # Audit failure must not turn a completed authentication into a failed callback.
    try:
        with transaction.atomic():
            log_auth_event(
                request, event_type, user=user, success=success,
                message=f'OAuth {event_type}: {provider}',
                metadata={'method': 'oauth', 'provider': provider, 'reason': reason},
            )
    except Exception as exc:
        logger.error('OAuth audit failed: exception=%s', type(exc).__name__)


@receiver(django_user_logged_in)
def clear_previous_oauth_session(request, **kwargs):
    from starview_app.models import UserProfile
    request.session.pop('oauth_account_id', None)
    request.session.pop('starview_recent_auth', None)
    request.session['identity_version'] = UserProfile.objects.values_list('security_version', flat=True).get(user=kwargs['user'])


@receiver(user_logged_in)
def record_oauth_login(request, user, sociallogin=None, **kwargs):
    from starview_app.services.account_security import mark_recent
    from starview_app.services.login_session import REMEMBER_KEY, remember_login
    # OAuth state and Login.signal_kwargs survive the pending MFA stage. Never
    # use a global pending preference that another sign-in tab could overwrite.
    remember = sociallogin.state.get(REMEMBER_KEY) if sociallogin else kwargs.get(REMEMBER_KEY)
    remember_login(request, remember)
    methods = request.session.get('account_authentication_methods', [])
    mark_recent(request, user, 'oauth' if sociallogin else 'password',
                mfa=any(item.get('method') == 'mfa' for item in methods))
    if sociallogin is not None:
        request.session['oauth_account_id'] = sociallogin.account.pk
        audit_oauth(request, 'login_success', user=user, provider=sociallogin.account.provider)
    else:
        log_auth_event(request, 'login_success', user=user, message='Password login completed.', metadata={'method': 'password'})


@receiver(authentication_step_completed)
def record_mfa_confirmation(request, user, method, **kwargs):
    if method == 'mfa' and request.user.is_authenticated and request.user.pk == user.pk:
        from starview_app.services.account_security import mark_recent
        mark_recent(request, user, 'mfa', mfa=True)


from allauth.mfa.signals import authenticator_added, authenticator_removed, authenticator_reset


@receiver(authenticator_added)
def record_mfa_enrollment(request, user, authenticator, **kwargs):
    if authenticator.type in ('totp', 'webauthn'):
        from allauth.account.internal.flows.login import record_authentication
        from starview_app.models import UserProfile
        already_enabled = user.userprofile.two_factor_enabled
        updates = {'two_factor_enabled': True}
        if authenticator.type == 'totp':
            updates['two_factor_method'] = UserProfile.TwoFactorMethod.AUTHENTICATOR
            user.userprofile.two_factor_method = UserProfile.TwoFactorMethod.AUTHENTICATOR
        UserProfile.objects.filter(user=user).update(**updates)
        user.userprofile.two_factor_enabled = True
        # Enrollment has just proved possession. Keep allauth's own recent-proof
        # history in sync so showing recovery codes does not ask for proof again.
        record_authentication(request, user, 'mfa', id=authenticator.pk, type=authenticator.type)
        credential_changed(request, user, 'mfa_method_added' if already_enabled else 'mfa_enabled')


@receiver(authenticator_removed)
def record_mfa_removal(request, user, authenticator, **kwargs):
    if authenticator.type in ('totp', 'webauthn'):
        credential_changed(request, user, 'mfa_method_removed')


@receiver(authenticator_reset)
def record_recovery_codes_reset(request, user, **kwargs):
    credential_changed(request, user, 'mfa_recovery_reset')


@receiver(social_account_added)
def record_provider_connection(request, sociallogin, **kwargs):
    credential_changed(request, sociallogin.user, 'provider_connected', provider=sociallogin.account.provider)


@receiver(social_account_removed)
def record_provider_removal(request, socialaccount, **kwargs):
    # Having confirmed another credential, the current session can survive the
    # deliberate removal of the provider originally used to open that session.
    methods = request.session.get('account_authentication_methods', [])
    remaining = [item for item in methods if not (
        item.get('method') == 'socialaccount' and item.get('provider') == socialaccount.provider
        and item.get('uid') == socialaccount.uid
    )]
    if len(remaining) != len(methods) or request.session.get('oauth_account_id') == socialaccount.pk:
        request.session.pop('oauth_account_id', None)
        request.session['account_authentication_methods'] = remaining
    credential_changed(request, socialaccount.user, 'provider_disconnected', provider=socialaccount.provider)



@receiver(user_signed_up)
@receiver(social_account_added)
@receiver(social_account_updated)
def retain_apple_revocation_credential(request, sociallogin=None, **kwargs):
    if sociallogin is not None:
        store_apple_credential(sociallogin)
