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
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.db import transaction
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
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
from starview_app.utils import LoginRateThrottle, PasswordResetThrottle, log_auth_event



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
def register(request):
        # Get form data
        username = request.data.get('username', '').strip()
        email = request.data.get('email', '').strip()
        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()
        pass1 = request.data.get('password1', '')
        pass2 = request.data.get('password2', '')

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

        # Validate email uniqueness
        if User.objects.filter(email=email.lower()).exists():
            raise exceptions.ValidationError({'email': 'This email address is already registered.'})

        # Check if email is associated with a social account on another user
        # This prevents hijacking social accounts by creating regular accounts with the same email
        from allauth.socialaccount.models import SocialAccount

        # Check if this email is used in any social account's extra_data
        # Social providers (Google, etc.) store the email in extra_data['email']
        # Use generic error message to prevent revealing whether it's a social or regular account
        for social_account in SocialAccount.objects.all():
            social_email = social_account.extra_data.get('email', '').lower()
            if social_email == email.lower():
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

        # Wrap user creation and email sending in a transaction
        # If email sending fails, user creation will be rolled back
        from allauth.account.models import EmailAddress, EmailConfirmation

        with transaction.atomic():
            # Create user after all validation passes
            user = User.objects.create_user(
                **user_data,
                password=pass1
            )

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
def custom_login(request):
        # Get form data
        username_or_email = request.data.get('username', '').strip().lower()
        password = request.data.get('password', '')
        next_url = request.data.get('next', '').strip()

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

        # Try to get user by username or email
        user_obj = User.objects.filter(
            Q(username=username_or_email) |
            Q(email=username_or_email)
        ).first()

        # Use generic error message to prevent user enumeration
        # Don't reveal whether the username/email exists or password is wrong
        generic_error = 'Invalid username or password.'

        # If user doesn't exist, return generic error (prevents user enumeration)
        if not user_obj:
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
                if not email_address.verified:
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

            login(request, authenticated_user)

            # Handle "Remember Me" functionality
            remember_me = request.data.get('remember_me', False)
            if remember_me:
                # Keep session for 30 days (2,592,000 seconds)
                request.session.set_expiry(2592000)
            else:
                # Session expires when browser closes (default behavior)
                request.session.set_expiry(0)

            # Audit log: Successful login
            log_auth_event(
                request=request,
                event_type='login_success',
                user=authenticated_user,
                success=True,
                message=f'User logged in successfully: {authenticated_user.username}',
                metadata={'auth_method': 'password', 'remember_me': remember_me}
            )

            # Determine redirect URL
            redirect_url = '/'
            if next_url and not next_url.startswith('/login'):
                redirect_url = next_url

            return Response({
                'detail': 'Login successful! Redirecting...',
                'redirect_url': redirect_url
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
    email = request.data.get('email', '').strip().lower()

    # Validate email provided
    if not email:
        raise exceptions.ValidationError('Email address is required.')

    # Validate email format
    try:
        validate_email(email)
    except ValidationError:
        raise exceptions.ValidationError('Please enter a valid email address.')

    # Try to find user with this email
    try:
        user = User.objects.get(email=email)
        user_found = True
    except User.DoesNotExist:
        user_found = False
        user = None

    # Always process the request to prevent timing attacks
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

            # Render email subject and body from templates
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
            email_msg.send(fail_silently=False)

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
    password1 = request.data.get('password1', '')
    password2 = request.data.get('password2', '')

    # Validate required fields
    if not password1 or not password2:
        raise exceptions.ValidationError({'password1': 'Both password fields are required.'})

    # Validate that passwords match
    passwords_match, match_error = PasswordService.validate_passwords_match(password1, password2)
    if not passwords_match:
        raise exceptions.ValidationError({'password2': match_error})

    # Decode user ID from base64
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        # Audit log: Invalid uidb64
        log_auth_event(
            request=request,
            event_type='password_reset_failed',
            username='',
            success=False,
            message='Password reset failed - invalid user ID',
            metadata={'uidb64': uidb64, 'reason': 'invalid_uid'}
        )
        raise exceptions.ValidationError('Invalid or expired password reset link.')

    # Validate token (checks signature and expiration)
    if not password_reset_token_generator.check_token(user, token):
        # Audit log: Invalid or expired token
        log_auth_event(
            request=request,
            event_type='password_reset_failed',
            user=user,
            success=False,
            message=f'Password reset failed - invalid/expired token: {user.username}',
            metadata={'reason': 'invalid_token'}
        )
        raise exceptions.ValidationError('Invalid or expired password reset link. Please request a new one.')

    # Validate password strength (context-aware)
    password_valid, validation_error = PasswordService.validate_password_strength(password1, user=user)
    if not password_valid:
        raise exceptions.ValidationError({'password1': validation_error})

    # Set new password using PasswordService
    success, error = PasswordService.set_password(user, password1)
    if not success:
        raise exceptions.APIException(error)

    # Clear account lockout (if any) - user successfully reset their password
    # This allows them to log in immediately after password reset
    from axes.utils import reset as axes_reset
    axes_reset(username=user.username)

    # Send password change notification email
    try:
        from django.contrib.sites.shortcuts import get_current_site

        # Get client IP for security notification
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            client_ip = x_forwarded_for.split(',')[0].strip()
        else:
            client_ip = request.META.get('REMOTE_ADDR', 'Unknown')

        current_site = get_current_site(request)

        # Email context
        context = {
            'user': user,
            'site_name': current_site.name,
            'client_ip': client_ip,
        }

        # Render email subject and body from templates
        subject = render_to_string('account/email/password_changed_subject.txt', context).strip()
        html_message = render_to_string('account/email/password_changed_message.html', context)
        text_message = render_to_string('account/email/password_changed_message.txt', context)

        # Create email message
        email_msg = EmailMultiAlternatives(
            subject=subject,
            body=text_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email]
        )
        email_msg.attach_alternative(html_message, "text/html")
        email_msg.send(fail_silently=True)  # Don't fail if email fails

    except Exception as e:
        # Log error but don't fail the password reset
        log_auth_event(
            request=request,
            event_type='password_changed_notification_failed',
            user=user,
            success=False,
            message=f'Failed to send password change notification to: {user.email}',
            metadata={'error': str(e)}
        )

    # Audit log: Password successfully changed via reset
    log_auth_event(
        request=request,
        event_type='password_changed',
        user=user,
        success=True,
        message=f'Password successfully reset: {user.username}',
        metadata={'method': 'password_reset_link', 'lockout_cleared': True}
    )

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
# Rate-limited to prevent email spam (max 1 per minute per email).              #
#                                                                               #
# Args:     request: HTTP request object with email in request body             #
# Returns:  DRF Response with success/error message                             #
# ----------------------------------------------------------------------------- #
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def resend_verification_email(request):
    email = request.data.get('email', '').strip().lower()

    # Validate email provided
    if not email:
        raise exceptions.ValidationError('Email address is required.')

    # Validate email format
    try:
        validate_email(email)
    except ValidationError:
        raise exceptions.ValidationError('Please enter a valid email address.')

    # Check if user with this email exists
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Don't reveal if email exists or not (prevent user enumeration)
        # Return success message regardless
        return Response({
            'detail': 'If an account with that email exists and is unverified, a verification email has been sent.'
        }, status=status.HTTP_200_OK)

    # Check if email is already verified
    from allauth.account.models import EmailAddress, EmailConfirmation
    try:
        email_address = EmailAddress.objects.get(user=user, email=email)
        if email_address.verified:
            # Email already verified
            raise exceptions.ValidationError('This email address is already verified. You can log in now.')
    except EmailAddress.DoesNotExist:
        # No EmailAddress entry - shouldn't happen, but handle gracefully
        raise exceptions.ValidationError('No account found with this email address.')

    # Send new verification email
    try:
        # Delete all existing confirmations for this email address
        # This ensures only the latest verification link works
        old_confirmations = EmailConfirmation.objects.filter(email_address=email_address)
        deleted_count = old_confirmations.count()
        old_confirmations.delete()

        # Create new confirmation and send email
        confirmation = EmailConfirmation.create(email_address)
        confirmation.send(request)

        # Audit log: Verification email resent
        log_auth_event(
            request=request,
            event_type='verification_email_resent',
            user=user,
            success=True,
            message=f'Verification email resent to: {email}',
            metadata={'email': email, 'old_confirmations_deleted': deleted_count}
        )

        return Response({
            'detail': 'Verification email sent! Please check your inbox.',
            'email_sent': True
        }, status=status.HTTP_200_OK)

    except Exception as e:
        # Audit log: Failed to send verification email
        log_auth_event(
            request=request,
            event_type='verification_email_failed',
            user=user,
            success=False,
            message=f'Failed to send verification email to: {email}',
            metadata={'email': email, 'error': str(e)}
        )
        raise exceptions.APIException('Failed to send verification email. Please try again later.')


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
def auth_status(request):
    if request.user.is_authenticated:
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
                'location': request.user.userprofile.location,
                'location_latitude': request.user.userprofile.location_latitude,
                'location_longitude': request.user.userprofile.location_longitude,
                'is_verified': request.user.userprofile.is_verified,
                'has_usable_password': request.user.has_usable_password(),
                'location_prompt_dismissed': request.user.userprofile.location_prompt_dismissed
            }
        }, status=status.HTTP_200_OK)
    else:
        return Response({
            'authenticated': False,
            'user': None
        }, status=status.HTTP_200_OK)
