# ----------------------------------------------------------------------------------------------------- #
# This adapters.py file customizes django-allauth behavior for the Starview application:                #
#                                                                                                       #
# Purpose:                                                                                              #
# Overrides default django-allauth adapters to customize authentication flows, redirects, and           #
# email handling to integrate seamlessly with the React frontend.                                       #
#                                                                                                       #
# Key Features:                                                                                         #
# - Custom redirects: Sends users to React frontend pages instead of Django templates                   #
# - Email verification flow: Redirects to React login page with success message                         #
# - Frontend integration: Ensures smooth SPA experience with query parameters                           #
# - Custom email confirmation view: Handles expired/invalid links by redirecting to React               #
#                                                                                                       #
# Integration:                                                                                          #
# Configured in settings.py via ACCOUNT_ADAPTER setting.                                                #
# Custom view configured in django_project/urls.py to override allauth view.                            #
# ----------------------------------------------------------------------------------------------------- #

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.views import ConfirmEmailView
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.urls import reverse
from django.http import HttpResponseRedirect, HttpResponseNotAllowed
from django.http import Http404
from django.views.generic import View
from django.views import View as BaseView
from django.contrib.auth.models import User
from django.contrib.auth import logout
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def send_welcome_email(request, user):
    """Shared by standard verification and verified OAuth signup."""
    try:
        from django.template.loader import render_to_string
        from django.core.mail import EmailMultiAlternatives
        from django.contrib.sites.shortcuts import get_current_site
        from django.utils import translation
        context = {'user': user, 'site_name': get_current_site(request).name}
        with translation.override(getattr(user.userprofile, 'language_preference', 'en')):
            subject = render_to_string('account/email/welcome_subject.txt', context).strip()
            text_content = render_to_string('account/email/welcome_message.txt', context)
            html_content = render_to_string('account/email/welcome_message.html', context)
        msg = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [user.email])
        msg.attach_alternative(html_content, 'text/html')
        from starview_app.services.account_mail import enqueue_account_email
        from django.db import transaction
        from django.utils import timezone
        from starview_app.models import UserProfile
        with transaction.atomic():
            profile = UserProfile.objects.select_for_update().get(user=user)
            if profile.welcome_email_queued_at is None:
                enqueue_account_email(msg, user=user, deduplication_key=f'welcome:{user.pk}')
                profile.welcome_email_queued_at = timezone.now()
                profile.save(update_fields=['welcome_email_queued_at'])
    except Exception as exc:
        # Mail failure must not abort completed verification or OAuth signup.
        logger.error('Welcome email failed: exception=%s', type(exc).__name__)


# ----------------------------------------------------------------------------- #
# Helper function to build React frontend URLs.                                 #
#                                                                               #
# In development, prepends the Vite dev server URL (localhost:5173).            #
# In production, returns the relative path (Django serves React build).         #
# ----------------------------------------------------------------------------- #
def get_frontend_url(path, query_params=None):
    """Build a frontend URL with optional query parameters."""
    if query_params:
        from urllib.parse import urlencode
        query_string = urlencode(query_params)
        path = f'{path}?{query_string}'

    if settings.DEBUG:
        return f'http://localhost:5173{path}'
    return path


def get_frontend_redirect_url(request, destination, fallback='/'):
    """Resolve a safe return path on the UI origin, including OAuth state URLs."""
    from urllib.parse import urlsplit, urlunsplit
    from django.utils.http import url_has_allowed_host_and_scheme

    allowed_hosts = {request.get_host()}
    if settings.DEBUG:
        allowed_hosts.add(urlsplit(get_frontend_url('/')).netloc)
    if not destination or not url_has_allowed_host_and_scheme(
        destination, allowed_hosts, require_https=request.is_secure(),
    ):
        return get_frontend_url(fallback)
    parsed = urlsplit(destination)
    path = parsed.path or '/'
    if not path.startswith('/'):
        path = f'/{path}'
    if not url_has_allowed_host_and_scheme(path, set()):
        return get_frontend_url(fallback)
    return get_frontend_url(urlunsplit(('', '', path, parsed.query, parsed.fragment)))


# ----------------------------------------------------------------------------- #
# Redirect views for django-allauth HTML pages.                                 #
#                                                                               #
# These views intercept allauth's default HTML pages and redirect users to      #
# the equivalent React frontend pages, ensuring a seamless SPA experience.      #
# ----------------------------------------------------------------------------- #
class AllAuthRedirectView(BaseView):
    """Base class for allauth redirect views."""
    redirect_path = '/'
    query_params = None

    def get(self, request, *args, **kwargs):
        return HttpResponseRedirect(get_frontend_url(self.redirect_path, self.query_params))


class EmailManagementRedirectView(AllAuthRedirectView):
    """Redirect /accounts/email/ to /profile (Settings tab)."""
    redirect_path = '/profile'


class PasswordChangeRedirectView(AllAuthRedirectView):
    """Redirect /accounts/password/change/ to /profile (Settings tab)."""
    redirect_path = '/profile'


class PasswordSetRedirectView(AllAuthRedirectView):
    """Redirect /accounts/password/set/ to /profile (Settings tab)."""
    redirect_path = '/profile'


class LoginRedirectView(AllAuthRedirectView):
    """Redirect /accounts/login/ to /login."""
    redirect_path = '/login'


class SignupRedirectView(AllAuthRedirectView):
    """Redirect /accounts/signup/ to /register."""
    redirect_path = '/register'


class LogoutRedirectView(BaseView):
    """Handle /accounts/logout/ - perform logout and redirect to home."""
    def get(self, request, *args, **kwargs):
        return HttpResponseNotAllowed(['POST'])

    def post(self, request, *args, **kwargs):
        logout(request)
        return HttpResponseRedirect(get_frontend_url('/'))


class PasswordResetRedirectView(AllAuthRedirectView):
    """Redirect /accounts/password/reset/ to /password-reset."""
    redirect_path = '/password-reset'


class PasswordResetDoneRedirectView(AllAuthRedirectView):
    """Redirect /accounts/password/reset/done/ to /password-reset with sent indicator."""
    redirect_path = '/password-reset'
    query_params = {'sent': 'true'}


class PasswordResetKeyDoneRedirectView(AllAuthRedirectView):
    """Redirect /accounts/password/reset/key/done/ to /login with success message."""
    redirect_path = '/login'
    query_params = {'password_reset': 'success'}


class EmailVerificationSentRedirectView(AllAuthRedirectView):
    """Redirect /accounts/confirm-email/ (no key) to /verify-email."""
    redirect_path = '/verify-email'


class InactiveAccountRedirectView(AllAuthRedirectView):
    """Redirect /accounts/inactive/ to /login with inactive message."""
    redirect_path = '/login'
    query_params = {'error': 'inactive'}


class LoginCodeConfirmRedirectView(AllAuthRedirectView):
    """Redirect /accounts/login/code/confirm/ to /login."""
    redirect_path = '/login'


class SocialLoginCancelledRedirectView(AllAuthRedirectView):
    """Redirect OAuth cancelled pages to /login with error."""
    redirect_path = '/login'
    query_params = {'error': 'oauth_cancelled'}


class SocialLoginErrorRedirectView(AllAuthRedirectView):
    """Redirect OAuth error pages to /login with error."""
    redirect_path = '/login'
    query_params = {'error': 'oauth_error'}


class SocialSignupRedirectView(AllAuthRedirectView):
    """Redirect social signup to /register."""
    redirect_path = '/register'


# ----------------------------------------------------------------------------- #
# Custom account adapter for django-allauth that redirects to React frontend.   #
#                                                                               #
# This adapter customizes the email verification flow to redirect users to      #
# the React login page with a success indicator instead of showing Django       #
# templates.                                                                    #
# ----------------------------------------------------------------------------- #
class CustomAccountAdapter(DefaultAccountAdapter):

    def get_login_stages(self):
        return [
            'starview_app.utils.verification_stage.VerificationStage'
            if stage == 'allauth.mfa.stages.AuthenticateStage' else stage
            for stage in super().get_login_stages()
        ]

    def send_mail(self, template_prefix, email, context):
        from starview_app.services.account_mail import enqueue_account_email
        from django.utils import timezone
        from datetime import timedelta
        message = self.render_mail(template_prefix, email, context)
        deadline = None
        if 'email_confirmation' in template_prefix:
            deadline = timezone.now() + timedelta(days=settings.ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS)
        enqueue_account_email(message, user=context.get('user'), expires_at=deadline)

    # ----------------------------------------------------------------------------- #
    # Redirect to React email verified page after successful email verification.    #
    #                                                                               #
    # Instead of showing the default django-allauth template, this redirects        #
    # users to a custom React success page that confirms verification and           #
    # provides a link to login.                                                     #
    #                                                                               #
    # Adds a success token to prevent unauthorized access to the page.              #
    #                                                                               #
    # Args:                                                                         #
    #   - email_address: EmailAddress instance that was verified                    #
    # Returns:                                                                      #
    #   - str: URL to redirect to after email verification                          #
    # ----------------------------------------------------------------------------- #
    def get_email_verification_redirect_url(self, email_address):
        import secrets

        # Generate a one-time success token
        success_token = secrets.token_urlsafe(16)

        return get_frontend_url('/email-verified', {'success': success_token})


    # ----------------------------------------------------------------------------- #
    # Redirect to React home page after successful login.                           #
    #                                                                               #
    # Overrides the default login redirect to send users to the React               #
    # frontend home page instead of a Django template.                              #
    #                                                                               #
    # Args:                                                                         #
    #   - request: HTTP request object                                              #
    # Returns:                                                                      #
    #   - str: URL to redirect to after login                                       #
    # ----------------------------------------------------------------------------- #
    def get_login_redirect_url(self, request):
        # Check if this is a social account connection (not initial login)
        process = request.GET.get('process')
        if process == 'connect':
            return get_frontend_url('/profile')
        return get_frontend_redirect_url(request, request.GET.get('next'))


    # ----------------------------------------------------------------------------- #
    # Redirect to React home page after successful logout.                          #
    #                                                                               #
    # Overrides the default logout redirect to send users to the React              #
    # frontend home page instead of a Django template.                              #
    #                                                                               #
    # Args:                                                                         #
    #   - request: HTTP request object                                              #
    # Returns:                                                                      #
    #   - str: URL to redirect to after logout                                      #
    # ----------------------------------------------------------------------------- #
    def get_logout_redirect_url(self, request):
        return get_frontend_url('/')


    # ----------------------------------------------------------------------------- #
    # Redirect to React home page after successful signup.                          #
    #                                                                               #
    # Overrides the default signup redirect to send users to the React              #
    # frontend home page instead of a Django template.                              #
    #                                                                               #
    # Args:                                                                         #
    #   - request: HTTP request object                                              #
    # Returns:                                                                      #
    #   - str: URL to redirect to after signup                                      #
    # ----------------------------------------------------------------------------- #
    def get_signup_redirect_url(self, request):
        return get_frontend_url('/')


# ----------------------------------------------------------------------------- #
# Custom email confirmation view that redirects to React for all scenarios.     #
#                                                                               #
# This view intercepts the email confirmation flow and redirects to the React   #
# frontend instead of rendering Django templates.                               #
#                                                                               #
# Enhanced to handle email change verification:                                 #
# - Detects if this is an email change (user already has verified emails)       #
# - Updates User.email to the new verified email                                #
# - Sets new email as primary                                                   #
# - Removes old email addresses                                                 #
#                                                                               #
# Scenarios:                                                                    #
# - Expired/invalid link: Redirects to React error page                         #
# - Already confirmed: Redirects to React error page                            #
# - Valid confirmation: Processes normally and redirects via adapter            #
# ----------------------------------------------------------------------------- #
class CustomConfirmEmailView(ConfirmEmailView):

    def get(self, request, key, *args, **kwargs):
        from rest_framework.exceptions import ValidationError
        from starview_app.services.email_identity import confirm_email_change
        try:
            address = confirm_email_change(request, key)
        except Http404:
            return HttpResponseRedirect(get_frontend_url('/email-confirm-error', {'error': 'expired'}))
        except ValidationError:
            return HttpResponseRedirect(get_frontend_url('/email-confirm-error', {'error': 'already_confirmed'}))
        return HttpResponseRedirect(CustomAccountAdapter().get_email_verification_redirect_url(address))

    def post(self, request, key, *args, **kwargs):
        return self.get(request, key, *args, **kwargs)


# ----------------------------------------------------------------------------- #
# Custom social account connections view that redirects to React profile page.  #
#                                                                               #
# This view intercepts the social account connections success page              #
# (accounts/3rdparty/) and redirects to the React profile page instead of       #
# showing the Django template.                                                  #
# ----------------------------------------------------------------------------- #
class CustomConnectionsView(View):

    def get(self, request, *args, **kwargs):
        return HttpResponseRedirect(get_frontend_url('/profile', {'social_connected': 'true'}))

    def post(self, request, *args, **kwargs):
        # The API endpoint serializes disconnections and protects the last method.
        # Do not expose a second mutation path with different safeguards.
        return HttpResponseNotAllowed(['GET'])


# ----------------------------------------------------------------------------- #
# Custom social account adapter for additional validation.                     #
#                                                                               #
# This adapter adds extra security checks to prevent email conflicts when      #
# connecting social accounts, and generates user-friendly usernames from       #
# email addresses for OAuth signups.                                            #
# ----------------------------------------------------------------------------- #
class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def generate_state_param(self, state):
        from starview_app.services.login_session import REMEMBER_KEY
        if state.get('process') != 'connect':
            state[REMEMBER_KEY] = self.request.POST.get('remember_me') == 'true'
        return super().generate_state_param(state)


    def serialize_instance(self, instance):
        from allauth.socialaccount.models import SocialToken
        from starview_app.services.secret_storage import secret_cipher
        import json

        data = super().serialize_instance(instance)
        if isinstance(instance, SocialToken):
            # allauth stashes tokens while MFA/signup/reauthentication is pending.
            # Database sessions are signed, not encrypted; protect this payload
            # just like the long-lived Apple revocation credential.
            data = {'starview_oauth_token_v1': secret_cipher('oauth.pending-token.v1').encrypt(
                json.dumps(data).encode(),
            ).decode()}
        return data

    def deserialize_instance(self, model, data):
        from allauth.socialaccount.models import SocialToken
        from cryptography.fernet import InvalidToken
        from starview_app.services.secret_storage import secret_cipher
        import json

        if model is SocialToken:
            try:
                data = json.loads(secret_cipher('oauth.pending-token.v1').decrypt(
                    data['starview_oauth_token_v1'].encode(),
                ))
            except (InvalidToken, KeyError, TypeError, AttributeError, ValueError):
                # Invalid or pre-encryption pending logins must restart safely.
                raise ValueError('Invalid pending OAuth credential') from None
        return super().deserialize_instance(model, data)

    def on_authentication_error(self, request, provider, error=None, exception=None, extra_context=None):
        from allauth.core.exceptions import ImmediateHttpResponse
        from allauth.socialaccount.providers.base import AuthError
        code = 'oauth_cancelled' if error == AuthError.CANCELLED else 'oauth_error'
        # Provider exceptions can include token responses. Log only known categories.
        detail = str(exception).lower() if exception else ''
        reason = next((value for value in (
            'invalid_client', 'invalid_grant', 'invalid_request', 'unauthorized_client',
            'certificate_verify_failed', 'signature verification failed', 'token has expired',
            'audience', 'issuer',
        ) if value in detail), 'unspecified')
        if not exception and extra_context and 'state_id' in extra_context:
            reason = 'state_not_found'
        logger.warning('OAuth failed: provider=%s category=%s exception=%s reason=%s',
                       getattr(provider, 'id', 'unknown'), code,
                       type(exception).__name__ if exception else 'none', reason)
        from starview_app.utils.oauth_signals import audit_oauth
        audit_oauth(request, 'login_failed', provider=getattr(provider, 'id', 'unknown'), success=False, reason=reason)
        raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/login', {'error': code})))

    def get_connect_redirect_url(self, request, socialaccount):
        return get_frontend_url('/profile', {'social_connected': 'true'})

    def populate_user(self, request, sociallogin, data):
        """
        Populate user instance with data from social provider.

        Generates a guaranteed unique username using UUID pattern.
        Format: user####### (e.g., user7a3f9b2)

        This prevents any possible collision with existing password-based users.
        Users can change their username later from their profile settings.
        """
        from starview_app.services.oauth_identity import lock_callback_identity
        lock_callback_identity(request, sociallogin)
        if sociallogin.account.provider == 'apple':
            issued_at = sociallogin.account.extra_data.get('iat')
            if not isinstance(issued_at, (int, float)) or isinstance(issued_at, bool):
                from allauth.socialaccount.providers.oauth2.client import OAuth2Error
                raise OAuth2Error('Missing Apple authorization timestamp')
            # allauth's Apple response also contains bearer tokens; keep only profile claims.
            allowed = {'sub', 'email', 'email_verified', 'is_private_email', 'name'}
            sociallogin.account.extra_data = {
                key: value for key, value in sociallogin.account.extra_data.items() if key in allowed
            }
            # allauth replaces extra_data on returning login. Relay preferences
            # come only from our signed notification handler, never profile input.
            from allauth.socialaccount.models import SocialAccount
            existing = SocialAccount.objects.filter(provider='apple', uid=sociallogin.account.uid).first()
            if existing:
                for key in ('apple_relay_enabled', 'apple_relay_event_time'):
                    if key in existing.extra_data:
                        sociallogin.account.extra_data[key] = existing.extra_data[key]
            sociallogin.account.extra_data['apple_authorized_at'] = max(
                issued_at, existing.extra_data.get('apple_authorized_at', 0) if existing else 0,
            )
        user = super().populate_user(request, sociallogin, data)

        # Generate unique username with UUID
        import uuid

        # Use first 7 characters of UUID hex for a clean look
        # Pattern: user####### (e.g., user7a3f9b2)
        unique_id = uuid.uuid4().hex[:7]
        username = f"user{unique_id}"

        # Double-check uniqueness (extremely unlikely to collide, but safe)
        while User.objects.filter(username=username).exists():
            unique_id = uuid.uuid4().hex[:7]
            username = f"user{unique_id}"

        user.username = username

        return user

    def save_user(self, request, sociallogin, form=None):
        """
        Save OAuth user and send welcome email for new signups.

        This is called after a user signs up via social auth.
        We check if the user is new and send a welcome email.
        """
        from django.db import IntegrityError, transaction
        from allauth.core.exceptions import ImmediateHttpResponse
        from allauth.account.models import EmailAddress
        from starview_app.services.email_identity import is_email_conflict
        is_new_user = not sociallogin.user.pk
        try:
            with transaction.atomic():
                user = super().save_user(request, sociallogin, form)
                if is_new_user and EmailAddress.objects.filter(user=user, verified=True).exists():
                    send_welcome_email(request, user)
                return user
        except IntegrityError as exc:
            if is_email_conflict(exc):
                raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url(
                    '/social-account-exists', {'provider': sociallogin.account.provider},
                ))) from None
            raise

    def pre_social_login(self, request, sociallogin):
        """Link only after authentication to the existing profile and the provider.

        An email match is a discovery hint, never proof to transfer an identity.
        Apple relay addresses and different provider emails can be linked explicitly.
        """
        from allauth.core.exceptions import ImmediateHttpResponse
        from allauth.socialaccount.models import SocialAccount
        from starview_app.services.email_identity import email_owners

        # allauth gives the state-carried `next` precedence over both redirect
        # adapters. Normalize it before login/connect (and later MFA stages), so
        # a callback on Django's development port returns to the Vite UI.
        if sociallogin.state.get('next'):
            fallback = '/profile?social_connected=true' if sociallogin.state.get('process') == 'connect' else '/'
            sociallogin.state['next'] = get_frontend_redirect_url(
                request, sociallogin.state['next'], fallback=fallback,
            )

        provider = sociallogin.account.provider
        existing_social = SocialAccount.objects.filter(
            provider=provider, uid=sociallogin.account.uid
        ).first()
        email = (sociallogin.account.extra_data.get('email') or '').strip()
        matches = User.objects.none()
        if email:
            matches = email_owners(email)

        if sociallogin.state.get('process') == 'connect':
            if not request.user.is_authenticated:
                raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/login')))
            from starview_app.services.account_security import is_recent
            if not is_recent(request):
                raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/profile', {'error': 'reauthentication_required'})))
            if existing_social and existing_social.user_id != request.user.pk:
                error = 'social_already_connected'
            elif matches.exclude(pk=request.user.pk).exists():
                error = 'email_conflict'
            else:
                return
            raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/profile', {'error': error})))

        # An established provider+subject remains the identity even if its email changes.
        if existing_social:
            return
        if matches.exists():
            params = {'provider': provider} if provider in ('apple', 'google') else None
            raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/social-account-exists', params)))
