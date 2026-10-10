# ----------------------------------------------------------------------------------------------------- #
# This views_auth.py file handles all authentication-related views:                                     #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides user authentication functionality including registration, login, logout, and password        #
# reset. Uses DRF exceptions for consistent error handling via the global exception handler.            #
#                                                                                                       #
# Key Features:                                                                                         #
# - User registration: AJAX endpoint with validation, duplicate checking, and password strength rules   #
# - Login: AJAX endpoint supporting username or email authentication                                    #
# - Logout: End user sessions and redirect to home                                                      #
# - Password reset: Email-based password recovery workflow with Django's built-in views                 #
# - Unified error handling: All errors raise DRF exceptions caught by the exception handler             #
#                                                                                                       #
# Architecture:                                                                                         #
# - AJAX-enabled function-based views for registration and login (with fallback rendering)              #
# - Function-based logout view with login requirement                                                   #
# - Class-based views for Django's password reset workflow                                              #
# - Integrates with PasswordService for centralized password validation                                 #
# - Integrates with global exception handler for standardized JSON error responses                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from collections.abc import Mapping

from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.db import transaction
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils import translation
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

# DRF imports:
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status, exceptions
from rest_framework.response import Response

# django-axes imports for account lockout:
from axes.exceptions import AxesBackendPermissionDenied
from axes.handlers.proxy import AxesProxyHandler

# Service imports:
from starview_app.services import PasswordService
from starview_app.services.account_mail import enqueue_account_email
from starview_app.services.email_identity import email_owners, email_change_transaction, verified_primary, password_login_user
from starview_app.utils import LoginRateThrottle, PasswordResetThrottle, log_auth_event


def _auth_payload(data):
    if not isinstance(data, Mapping):
        raise exceptions.ValidationError('Provide an object with authentication fields.')
    return data


def _auth_text(data, field, *, strip=True, max_length=None):
    value = data.get(field, '')
    if not isinstance(value, str):
        raise exceptions.ValidationError({field: 'Enter a text value.'})
    if strip:
        value = value.strip()
    if max_length is not None and len(value) > max_length:
        raise exceptions.ValidationError({field: f'Use {max_length} characters or fewer.'})
    return value



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                    REGISTRATION & LOGIN                                               #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Handle user registration with validation.                                     #
#                                                                               #
# DRF API endpoint that validates username uniqueness, email format and         #
# uniqueness, password confirmation and strength. Creates a new user account    #
# and returns JSON response with success status and redirect URL.               #
#                                                                               #
# Throttling: Limited to 5 requests per minute to prevent abuse                 #
#                                                                               #
# Args:     request: HTTP request object                                        #
# Returns:  Rendered registration page (GET) or DRF Response (POST)             #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
@csrf_protect
def register(request):
        # Get form data
        data = _auth_payload(request.data)
        from starview_app.services.birth_dates import parse_birth_date
        birth_date = parse_birth_date(data)
        username = _auth_text(data, 'username')
        email = _auth_text(data, 'email', max_length=User._meta.get_field('email').max_length)
        first_name = _auth_text(data, 'first_name', max_length=User._meta.get_field('first_name').max_length)
        last_name = _auth_text(data, 'last_name', max_length=User._meta.get_field('last_name').max_length)
        pass1 = _auth_text(data, 'password1', strip=False)
        pass2 = _auth_text(data, 'password2', strip=False)

        # Validate required fields (username is now optional)
        if not all([email, first_name, last_name, pass1, pass2]):
            raise exceptions.ValidationError('All fields are required.')

        # Generate unique username if not provided
        if not username:
            import uuid
            # Use same pattern as OAuth: user#######
            unique_id = uuid.uuid4().hex[:7]
            username = f"user{unique_id}"

            # Ensure uniqueness (extremely unlikely to collide, but safe)
            while User.objects.filter(username=username).exists():
                unique_id = uuid.uuid4().hex[:7]
                username = f"user{unique_id}"
        else:
            # If username provided, validate it
            import re
            username = username.lower()

            # Validate format (3-30 chars, alphanumeric + underscore + hyphen)
            if len(username) < 3:
                raise exceptions.ValidationError({'username': 'Username must be at least 3 characters.'})
            if len(username) > 30:
                raise exceptions.ValidationError({'username': 'Username must be 30 characters or less.'})
            if not re.match(r'^[a-z0-9_-]+$', username):
                raise exceptions.ValidationError({'username': 'Username can only contain letters, numbers, underscores, and hyphens.'})

            # Validate username uniqueness
            if User.objects.filter(username=username).exists():
                raise exceptions.ValidationError({'username': 'This username is already taken.'})

        # Validate email format using Django's built-in validator
        try:
            validate_email(email)
        except ValidationError:
            raise exceptions.ValidationError({'email': 'Please enter a valid email address.'})

        if email_owners(email).exists():
            raise exceptions.ValidationError({'email': 'This email address is already registered.'})

        # Validate that passwords match
        passwords_match, match_error = PasswordService.validate_passwords_match(pass1, pass2)
        if not passwords_match:
            raise exceptions.ValidationError({'password2': match_error})

        # Prepare user data (DRY - used for both validation and creation)
        user_data = {
            'username': username,
            'email': email.lower(),
            'first_name': first_name,
            'last_name': last_name
        }

        # Create temporary user instance for context-aware password validation
        temp_user = User(**user_data)

        # Validate password strength (context-aware using temp_user)
        password_valid, validation_error = PasswordService.validate_password_strength(pass1, user=temp_user)
        if not password_valid:
            raise exceptions.ValidationError({'password1': validation_error})

        # Save account, confirmation, and queued mail together; send after commit.
        from allauth.account.models import EmailAddress, EmailConfirmation

        with email_change_transaction():
            # Create user after all validation passes
            user = User.objects.create_user(
                **user_data,
                password=pass1
            )
            if birth_date is not None:
                user.userprofile.birth_date = birth_date
                user.userprofile.save(update_fields=['birth_date', 'updated_at'])

            # Create EmailAddress entry for django-allauth (always unverified)
            email_address = EmailAddress.objects.create(
                user=user,
                email=email.lower(),
                verified=False,  # Always require email verification
                primary=True
            )

            # Always send verification email (mandatory verification)
            confirmation = EmailConfirmation.create(email_address)
            confirmation.send(request, signup=True)

            # Audit log: Successful registration
            log_auth_event(
                request=request,
                event_type='registration_success',
                user=user,
                success=True,
                message=f'New user registered (email verification required): {user.username}',
                metadata={'email': user.email, 'verified': False}
            )

            return Response({
                'detail': 'Account created! Please check your email to verify your account before logging in.',
                'email_sent': True,
                'requires_verification': True
            }, status=status.HTTP_201_CREATED)


# ----------------------------------------------------------------------------- #
# Handle user login with username or email.                                     #
#                                                                               #
# DRF API endpoint that authenticates users using either their username or      #
# email. Returns JSON response with success status and redirect URL.            #
#                                                                               #
# Throttling: Limited to 5 requests per minute to prevent brute force attacks   #
#                                                                               #
# Args:     request: HTTP request object                                        #
# Returns:  Rendered login page (GET) or DRF Response (POST)                    #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
@csrf_protect
def custom_login(request):
        # Get form data
        data = _auth_payload(request.data)
        username_or_email = _auth_text(data, 'username').lower()
        password = _auth_text(data, 'password', strip=False)
        next_url = _auth_text(data, 'next')
        remember_me = data.get('remember_me', False)
        if not isinstance(remember_me, bool):
            raise exceptions.ValidationError({'remember_me': 'Use true or false.'})

        # Validate required fields
        if not username_or_email or not password:
            raise exceptions.ValidationError('Username and password are required.')

        # Check if request is already locked out.
        # This prevents further authentication attempts when account is locked
        if AxesProxyHandler.is_locked(request):
            # Audit log: Login attempt while locked
            log_auth_event(
                request=request,
                event_type='login_locked',
                username=username_or_email,
                success=False,
                message=f'Login attempt blocked - account locked: {username_or_email}',
                metadata={'reason': 'account_locked'}
            )
            raise exceptions.PermissionDenied(
                'Account locked due to too many login attempts. Please try again later.'
            )

        # Verified linked-provider aliases still require the local password.
        user_obj = password_login_user(username_or_email)

        # Use generic error message to prevent user enumeration
        # Don't reveal whether the username/email exists or password is wrong
        generic_error = 'Invalid username or password.'

        # If user doesn't exist, return generic error (prevents user enumeration)
        if not user_obj:
            # Match the expensive hash work done for a real account's wrong
            # password; the response must not expose existence through timing.
            User().set_password(password)
            # Audit log: Failed login - user not found
            log_auth_event(
                request=request,
                event_type='login_failed',
                username=username_or_email,
                success=False,
                message=f'Login failed - user not found: {username_or_email}',
                metadata={'reason': 'user_not_found'}
            )
            # Use 400 instead of 401 to prevent browser's HTTP auth dialog
            raise exceptions.ValidationError(generic_error)

        # Authenticate with username (django-axes intercepts this call)
        # Phase 4: Account Lockout - AxesBackendPermissionDenied raised if account is locked
        try:
            authenticated_user = authenticate(request, username=user_obj.username, password=password)
        except AxesBackendPermissionDenied:
            # Account is locked out due to too many failed attempts
            # Axes already tracks this in its own models
            raise exceptions.PermissionDenied(
                'Account locked due to too many login attempts. Please try again later.'
            )

        if authenticated_user is not None:
            # Check email verification requirement (always enforced)
            from allauth.account.models import EmailAddress
            try:
                email_address = EmailAddress.objects.get(user=authenticated_user, primary=True)
                if not email_address.verified or email_address.email.lower() != authenticated_user.email.lower():
                    # Audit log: Login blocked - email not verified
                    log_auth_event(
                        request=request,
                        event_type='login_failed',
                        user=authenticated_user,
                        success=False,
                        message=f'Login blocked - email not verified: {authenticated_user.username}',
                        metadata={'reason': 'email_not_verified'}
                    )
                    # Return error with email so frontend can display it
                    return Response({
                        'detail': 'Please verify your email address before logging in. Check your inbox for the verification link.',
                        'email': authenticated_user.email,
                        'requires_verification': True
                    }, status=status.HTTP_403_FORBIDDEN)
            except EmailAddress.DoesNotExist:
                # No EmailAddress entry - treat as unverified
                log_auth_event(
                    request=request,
                    event_type='login_failed',
                    user=authenticated_user,
                    success=False,
                    message=f'Login blocked - no email address: {authenticated_user.username}',
                    metadata={'reason': 'no_email_address'}
                )
                raise exceptions.PermissionDenied(
                    'Please verify your email address before logging in.'
                )

            # Use allauth's login stages so password login cannot bypass MFA.
            from allauth.account.models import Login
            from allauth.account.internal.flows.login import perform_password_login
            from starview_app.utils.adapters import get_frontend_url
            from django.utils.http import url_has_allowed_host_and_scheme
            request.session.pop('account_authentication_methods', None)

            from starview_app.services.login_session import REMEMBER_KEY

            # Determine redirect URL
            redirect_url = '/'
            if (next_url and next_url.startswith('/') and not next_url.startswith('/login')
                    and url_has_allowed_host_and_scheme(next_url, {request.get_host()}, require_https=request.is_secure())):
                redirect_url = next_url

            result = perform_password_login(
                request._request, {'username': authenticated_user.username},
                Login(user=authenticated_user, redirect_url=get_frontend_url(redirect_url),
                      signal_kwargs={REMEMBER_KEY: remember_me}),
            )

            return Response({
                'detail': 'Continue signing in.' if not request._request.user.is_authenticated else 'Login successful!',
                'redirect_url': result.get('Location', get_frontend_url('/')),
            }, status=status.HTTP_200_OK)

        # Authentication failed - check if this failure triggered a lockout
        # The lockout occurs AFTER the failed attempt is recorded:
        if AxesProxyHandler.is_locked(request):
            # Audit log: Account just got locked
            log_auth_event(
                request=request,
                event_type='login_locked',
                username=user_obj.username,
                success=False,
                message=f'Account locked after failed login attempt: {user_obj.username}',
                metadata={'reason': 'exceeded_failure_limit'}
            )
            raise exceptions.PermissionDenied(
                'Account locked due to too many login attempts. Please try again later.'
            )

        # Audit log: Failed login - invalid password
        log_auth_event(
            request=request,
            event_type='login_failed',
            username=user_obj.username,
            success=False,
            message=f'Login failed - invalid password: {user_obj.username}',
            metadata={'reason': 'invalid_password'}
        )

        # Invalid password - use same generic error (prevents user enumeration)
        # Use 400 instead of 401 to prevent browser's HTTP auth dialog
        raise exceptions.ValidationError(generic_error)


# ----------------------------------------------------------------------------- #
# Handle user logout via API endpoint.                                          #
#                                                                               #
# Ends the user's session and returns JSON response.                            #
#                                                                               #
# Args:     Request: HTTP request object                                        #
# Returns:  DRF Response with success message                                   #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def custom_logout(request):
    # Get user before logout (session cleared after logout())
    user = request.user

    # Audit log: User logout
    log_auth_event(
        request=request,
        event_type='logout',
        user=user,
        success=True,
        message=f'User logged out: {user.username}',
        metadata={}
    )

    logout(request)
    return Response({
        'detail': 'Logout successful.',
        'redirect_url': '/'
    }, status=status.HTTP_200_OK)



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                    PASSWORD RESET API                                                 #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# Initialize password reset token generator (stateless, cryptographically secure)
password_reset_token_generator = PasswordResetTokenGenerator()

# ----------------------------------------------------------------------------- #
# Request password reset email.                                                 #
#                                                                               #
# DRF API endpoint that sends password reset email to users who forgot their    #
# password. Returns generic success message regardless of whether email exists  #
# to prevent user enumeration.                                                  #
#                                                                               #
# Security Features:                                                            #
# - Rate limiting: 5 requests per minute per IP (prevents email bombing)        #
# - User enumeration prevention: Always returns success message                 #
# - Token expiration: 1 hour (configurable via PASSWORD_RESET_TIMEOUT)          #
# - Single-use tokens: Token invalidated after password change                  #
# - Audit logging: All requests logged for security monitoring                  #
# - Account lockout bypass: Allows password reset even when account is locked   #
#                           (legitimate recovery path)                          #
#                                                                               #
# Args:     request: HTTP request with 'email' in request body                  #
# Returns:  DRF Response with generic success message                           #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def request_password_reset(request):
    data = _auth_payload(request.data)
    email = _auth_text(data, 'email').lower()
    request_lang = _auth_text(data, 'language').lower()

    # Validate email provided
    if not email:
        raise exceptions.ValidationError('Email address is required.')

    # Validate email format
    try:
        validate_email(email)
    except ValidationError:
        raise exceptions.ValidationError('Please enter a valid email address.')

    # Recovery uses a verified primary contact, not an arbitrary provider email.
    # Fail closed if legacy duplicate data makes the owner ambiguous.
    from allauth.account.models import EmailAddress
    owners = list(EmailAddress.objects.select_related('user').filter(
        email__iexact=email, primary=True, verified=True,
        user__email__iexact=email, user__is_active=True,
    )[:2])
    user = owners[0].user if len(owners) == 1 else None
    user_found = user is not None

    # Return the same response for unknown and ineligible addresses.
    if user_found:
        # Generate password reset token (stateless, expires in 1 hour)
        token = password_reset_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))

        # Build password reset URL (React frontend)
        if settings.DEBUG:
            reset_url = f'http://localhost:5173/password-reset-confirm/{uid}/{token}/'
        else:
            reset_url = f'https://{settings.ALLOWED_HOSTS[0]}/password-reset-confirm/{uid}/{token}/'

        # Get client IP for security notification in email
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            client_ip = x_forwarded_for.split(',')[0].strip()
        else:
            client_ip = request.META.get('REMOTE_ADDR', 'Unknown')

        # Send password reset email
        try:
            from django.contrib.sites.shortcuts import get_current_site

            current_site = get_current_site(request)

            # Email context
            context = {
                'user': user,
                'reset_url': reset_url,
                'site_name': current_site.name,
                'client_ip': client_ip,
                'expiration_hours': 1,
            }

            # Get user's language preference for email localization
            # Prefer request-provided language (for unauthenticated users with UI language set)
            # Fall back to user's stored preference
            valid_languages = [code for code, name in settings.LANGUAGES]
            if request_lang and request_lang in valid_languages:
                user_lang = request_lang
            else:
                user_lang = getattr(user.userprofile, 'language_preference', 'en')

            # Render email subject and body from templates in user's preferred language
            with translation.override(user_lang):
                subject = render_to_string('account/email/password_reset_subject.txt', context).strip()
                html_message = render_to_string('account/email/password_reset_message.html', context)
                text_message = render_to_string('account/email/password_reset_message.txt', context)

            # Create email message
            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[user.email]
            )
            email_msg.attach_alternative(html_message, "text/html")
            from django.utils import timezone
            from datetime import timedelta
            enqueue_account_email(email_msg, user=user, expires_at=timezone.now() + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT))

            # Audit log: Password reset email sent
            log_auth_event(
                request=request,
                event_type='password_reset_requested',
                user=user,
                success=True,
                message=f'Password reset email sent to: {user.email}',
                metadata={
                    'email': user.email,
                    'uid': uid,
                    'client_ip': client_ip
                }
            )

        except Exception as e:
            # Log error but don't reveal to user (prevents enumeration)
            log_auth_event(
                request=request,
                event_type='password_reset_email_failed',
                user=user,
                success=False,
                message=f'Failed to send password reset email to: {user.email}',
                metadata={'email': user.email, 'error': str(e)}
            )
            # Still return success to user (prevent enumeration)

    else:
        # User not found - log for security monitoring but return success
        log_auth_event(
            request=request,
            event_type='password_reset_requested',
            username='',
            success=True,
            message=f'Password reset requested for non-existent email: {email}',
            metadata={'email': email, 'user_found': False}
        )

    # Always return success message (prevent user enumeration)
    return Response({
        'detail': 'If an account exists with that email address, you will receive password reset instructions.',
        'email_sent': True
    }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------------- #
# Confirm password reset with token and set new password.                       #
#                                                                               #
# DRF API endpoint that validates the password reset token and sets a new      #
# password for the user. Clears account lockout on successful password change.  #
#                                                                               #
# Security Features:                                                            #
# - Token validation: Verifies cryptographic signature and expiration          #
# - Single-use enforcement: Token invalidated after use                        #
# - Password validation: Uses PasswordService for consistency                   #
# - Account lockout clearance: Resets failed login attempts after success      #
# - Notification email: Sends confirmation email after password change          #
# - Audit logging: All attempts logged for security monitoring                  #
#                                                                               #
# Args:     request: HTTP request with 'password1', 'password2' in body        #
#           uidb64: Base64-encoded user ID from reset link                     #
#           token: Password reset token from reset link                        #
# Returns:  DRF Response with success/error message                            #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def confirm_password_reset(request, uidb64, token):
    # Get passwords from request
    data = _auth_payload(request.data)
    password1 = _auth_text(data, 'password1', strip=False)
    password2 = _auth_text(data, 'password2', strip=False)

    # Validate required fields
    if not password1 or not password2:
        raise exceptions.ValidationError({'password1': 'Both password fields are required.'})

    # Validate that passwords match
    passwords_match, match_error = PasswordService.validate_passwords_match(password1, password2)
    if not passwords_match:
        raise exceptions.ValidationError({'password2': match_error})

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        # Re-read and consume under one lock. Two requests using the same reset
        # token cannot both replace the password, even across different workers.
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=uid)
            if not verified_primary(user) or not password_reset_token_generator.check_token(user, token):
                raise exceptions.ValidationError('Invalid or expired password reset link. Please request a new one.')
            success, error = PasswordService.set_password(user, password1)
            if not success:
                raise exceptions.ValidationError({'password1': error})
            from starview_app.services.account_security import revoke_account_sessions
            revoke_account_sessions(user)
            from starview_app.services.account_events import record_account_event
            record_account_event(request, user, 'password_changed', method='password_reset_link')
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise exceptions.ValidationError('Invalid or expired password reset link.') from None

    # Clear account lockout (if any) - user successfully reset their password
    # This allows them to log in immediately after password reset
    from axes.utils import reset as axes_reset
    axes_reset(username=user.username)

    return Response({
        'detail': 'Password reset successful! You can now log in with your new password.',
        'success': True
    }, status=status.HTTP_200_OK)



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                    EMAIL VERIFICATION                                                 #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Resend email verification link to user.                                       #
#                                                                               #
# DRF API endpoint that sends a new verification email to unverified users.     #
# Uses the configured IP throttle and allauth mailbox confirmation limit.       #
#                                                                               #
# Args:     request: HTTP request object with email in request body             #
# Returns:  DRF Response with success/error message                             #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def resend_verification_email(request):
    data = _auth_payload(request.data)
    email = _auth_text(data, 'email').lower()

    # Validate email provided
    if not email:
        raise exceptions.ValidationError('Email address is required.')

    # Validate email format
    try:
        validate_email(email)
    except ValidationError:
        raise exceptions.ValidationError('Please enter a valid email address.')

    from starview_app.services.email_identity import resend_primary_confirmation
    try:
        resend_primary_confirmation(request, email)
    except Exception as exc:
        # Enqueue failures preserve the old link. Keep the public result generic
        # and never log message bodies, link keys, or upstream exception text.
        import logging
        logging.getLogger(__name__).error(
            'Verification resend failed: exception=%s', type(exc).__name__,
        )
    return Response({
        'detail': 'If an account with that email exists and is unverified, a verification email has been sent.',
        'email_sent': True,
        'resend_after': settings.ACCOUNT_EMAIL_RESEND_COOLDOWN,
    }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                    AUTHENTICATION STATUS                                              #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Check if user is authenticated and return user information.                   #
#                                                                               #
# DRF API endpoint that returns authentication status and basic user info.      #
# Useful for frontend components (like navbar) to conditionally render UI       #
# based on authentication state without making unnecessary authenticated        #
# requests to other endpoints.                                                  #
#                                                                               #
# Note: Throttling is disabled for this endpoint because it's a lightweight     #
# check that needs to be called frequently (on page load, after auth changes).  #
#                                                                               #
# Args:     request: HTTP request object                                        #
# Returns:  DRF Response with authentication status and user data               #
# ----------------------------------------------------------------------------- #
@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])  # Disable throttling for auth status checks
@ensure_csrf_cookie
def auth_status(request):
    if request.user.is_authenticated:
        from starview_app.services.account_security import has_mfa
        from starview_app.services.birth_dates import should_prompt_birth_date
        return Response({
            'authenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name,
                'date_joined': request.user.date_joined,
                'profile_picture_url': request.user.userprofile.get_profile_picture_url,
                'bio': request.user.userprofile.bio,
                'is_verified': request.user.userprofile.is_verified,
                'has_usable_password': request.user.has_usable_password(),
                'mfa_enabled': has_mfa(request.user),
                'is_staff': request.user.is_staff,
                'birth_date': request.user.userprofile.birth_date,
                'is_private': request.user.userprofile.is_private,
                'birth_date_prompt': should_prompt_birth_date(request),
            }
        }, status=status.HTTP_200_OK)
    else:
        return Response({
            'authenticated': False,
            'user': None
        }, status=status.HTTP_200_OK)
