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
from allauth.socialaccount.views import ConnectionsView
from django.urls import reverse
from django.http import HttpResponseRedirect
from django.http import Http404
from django.views.generic import View
from django.views import View as BaseView
from django.contrib.auth.models import User
from django.contrib.auth import logout
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


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
        logout(request)
        return HttpResponseRedirect(get_frontend_url('/'))

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


class ReauthenticateRedirectView(AllAuthRedirectView):
    """Redirect /accounts/reauthenticate/ to /login."""
    redirect_path = '/login'
    query_params = {'reauth': 'required'}


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
        from django.conf import settings

        # Generate a one-time success token
        success_token = secrets.token_urlsafe(16)

        # In development, redirect to React dev server
        # In production, use relative URL (Django serves React build)
        if settings.DEBUG:
            return f'http://localhost:5173/email-verified?success={success_token}'
        else:
            return f'/email-verified?success={success_token}'


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
        from django.conf import settings

        # Check if this is a social account connection (not initial login)
        process = request.GET.get('process')
        if process == 'connect':
            # After connecting social account, redirect to profile
            if settings.DEBUG:
                return 'http://localhost:5173/profile'
            else:
                return '/profile'

        # Default to home page, but respect 'next' parameter if provided
        next_url = request.GET.get('next')
        from django.utils.http import url_has_allowed_host_and_scheme
        if next_url and url_has_allowed_host_and_scheme(next_url, {request.get_host()}, require_https=request.is_secure()):
            # In development, prepend Vite URL if relative path
            if settings.DEBUG and next_url.startswith('/'):
                return f'http://localhost:5173{next_url}'
            return next_url

        # Default redirect to home
        if settings.DEBUG:
            return 'http://localhost:5173/'
        else:
            return '/'


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
        from django.conf import settings
        if settings.DEBUG:
            return 'http://localhost:5173/'
        return '/'


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
        from django.conf import settings
        if settings.DEBUG:
            return 'http://localhost:5173/'
        return '/'


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

    def get(self, *args, **kwargs):
        from django.conf import settings
        from allauth.account.models import EmailAddress

        try:
            self.object = self.get_object()

            # Check if email can be confirmed
            if not self.object or not self.object.email_address.can_set_verified():
                # Email already confirmed by this or another account
                error_url = '/email-confirm-error?error=already_confirmed'
                if settings.DEBUG:
                    error_url = f'http://localhost:5173{error_url}'
                return HttpResponseRedirect(error_url)

            # Get the email address being confirmed
            email_address = self.object.email_address
            user = email_address.user

            # Check if this is an email change (user already has other verified emails)
            is_email_change = EmailAddress.objects.filter(
                user=user,
                verified=True
            ).exclude(id=email_address.id).exists()

            # Valid confirmation - continue with normal flow
            # This will auto-confirm if ACCOUNT_CONFIRM_EMAIL_ON_GET is True
            # and then redirect via get_email_verification_redirect_url
            response = super().get(*args, **kwargs)

            # After confirmation completes, handle email change logic or send welcome email
            # Refresh the email_address object to get updated verified status
            email_address.refresh_from_db()

            if is_email_change:
                if email_address.verified:
                    # Set new email as primary
                    email_address.set_as_primary()

                    # Update the User model's email field
                    user.email = email_address.email
                    user.save()

                    # Remove all other email addresses for this user
                    EmailAddress.objects.filter(
                        user=user
                    ).exclude(id=email_address.id).delete()
            else:
                # This is a new user completing email verification for the first time
                # Send welcome email
                if email_address.verified:
                    from django.template.loader import render_to_string
                    from django.core.mail import EmailMultiAlternatives
                    from django.contrib.sites.shortcuts import get_current_site
                    from django.utils import translation

                    # Get site information
                    current_site = get_current_site(self.request)

                    # Build email context
                    context = {
                        'user': user,
                        'site_name': current_site.name,
                    }

                    # Get user's language preference for email localization
                    user_lang = getattr(user.userprofile, 'language_preference', 'en')

                    # Render email templates in user's preferred language
                    with translation.override(user_lang):
                        subject = render_to_string('account/email/welcome_subject.txt', context).strip()
                        text_content = render_to_string('account/email/welcome_message.txt', context)
                        html_content = render_to_string('account/email/welcome_message.html', context)

                    # Send email
                    from_email = settings.DEFAULT_FROM_EMAIL
                    msg = EmailMultiAlternatives(subject, text_content, from_email, [user.email])
                    msg.attach_alternative(html_content, "text/html")
                    msg.send()

            return response

        except Http404:
            # Expired or invalid confirmation key
            error_url = '/email-confirm-error?error=expired'
            if settings.DEBUG:
                error_url = f'http://localhost:5173{error_url}'
            return HttpResponseRedirect(error_url)


# ----------------------------------------------------------------------------- #
# Custom social account connections view that redirects to React profile page.  #
#                                                                               #
# This view intercepts the social account connections success page              #
# (accounts/3rdparty/) and redirects to the React profile page instead of       #
# showing the Django template.                                                  #
# ----------------------------------------------------------------------------- #
class CustomConnectionsView(View):

    def get(self, request, *args, **kwargs):
        from django.conf import settings

        # Redirect to React profile page with success message
        profile_url = '/profile?social_connected=true'
        if settings.DEBUG:
            profile_url = f'http://localhost:5173{profile_url}'

        return HttpResponseRedirect(profile_url)

    def post(self, request, *args, **kwargs):
        # Handle disconnect POST requests by delegating to default view
        # then redirecting back to profile
        from django.conf import settings

        # Process the disconnect
        view = ConnectionsView.as_view()
        response = view(request, *args, **kwargs)

        # After disconnect, redirect to profile
        profile_url = '/profile?social_disconnected=true'
        if settings.DEBUG:
            profile_url = f'http://localhost:5173{profile_url}'

        return HttpResponseRedirect(profile_url)


# ----------------------------------------------------------------------------- #
# Custom social account adapter for additional validation.                     #
#                                                                               #
# This adapter adds extra security checks to prevent email conflicts when      #
# connecting social accounts, and generates user-friendly usernames from       #
# email addresses for OAuth signups.                                            #
# ----------------------------------------------------------------------------- #
class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):

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
        if sociallogin.account.provider == 'apple':
            # allauth's Apple response also contains bearer tokens; keep only profile claims.
            allowed = {'sub', 'email', 'email_verified', 'is_private_email', 'name'}
            sociallogin.account.extra_data = {
                key: value for key, value in sociallogin.account.extra_data.items() if key in allowed
            }
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
        # Check if this is a new user (not yet saved)
        is_new_user = not sociallogin.user.pk

        # Call parent to save the user
        user = super().save_user(request, sociallogin, form)

        # Send welcome email for new users only
        if is_new_user:
            from django.template.loader import render_to_string
            from django.core.mail import EmailMultiAlternatives
            from django.contrib.sites.shortcuts import get_current_site
            from django.conf import settings
            from django.utils import translation

            # Get site information
            current_site = get_current_site(request)

            # Build email context
            context = {
                'user': user,
                'site_name': current_site.name,
            }

            # Get user's language preference for email localization
            user_lang = getattr(user.userprofile, 'language_preference', 'en')

            # Render email templates in user's preferred language
            with translation.override(user_lang):
                subject = render_to_string('account/email/welcome_subject.txt', context).strip()
                text_content = render_to_string('account/email/welcome_message.txt', context)
                html_content = render_to_string('account/email/welcome_message.html', context)

            # Send email
            from_email = settings.DEFAULT_FROM_EMAIL
            msg = EmailMultiAlternatives(subject, text_content, from_email, [user.email])
            msg.attach_alternative(html_content, "text/html")
            msg.send()

        return user

    def pre_social_login(self, request, sociallogin):
        """Link only after authentication to the existing profile and the provider.

        An email match is a discovery hint, never proof to transfer an identity.
        Apple relay addresses and different provider emails can be linked explicitly.
        """
        from allauth.core.exceptions import ImmediateHttpResponse
        from allauth.socialaccount.models import SocialAccount
        from django.db.models import Q

        provider = sociallogin.account.provider
        existing_social = SocialAccount.objects.filter(
            provider=provider, uid=sociallogin.account.uid
        ).first()
        email = (sociallogin.account.extra_data.get('email') or '').strip()
        matches = User.objects.none()
        if email:
            matches = User.objects.filter(
                Q(email__iexact=email)
                | Q(emailaddress__email__iexact=email)
                | Q(socialaccount__extra_data__email__iexact=email)
            ).distinct()

        if sociallogin.state.get('process') == 'connect':
            if not request.user.is_authenticated:
                raise ImmediateHttpResponse(HttpResponseRedirect(get_frontend_url('/login')))
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
