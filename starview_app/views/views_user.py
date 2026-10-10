# ----------------------------------------------------------------------------------------------------- #
# This views_user.py file handles user profile and account management views:                            #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides both public user profile viewing and authenticated profile management. Supports public       #
# profile pages at /api/users/{username}/ and private profile management at /api/users/me/*.           #
#                                                                                                       #
# Key Features:                                                                                         #
# - Public Profiles: View any user's public profile, reviews, and stats (no auth required)             #
# - Account Management: Full profile and account settings for authenticated users                       #
# - Profile Updates: AJAX endpoints for profile pictures, names, email, passwords, bio                 #
# - Password Security: Integrates with PasswordService for consistent validation across the app         #
# - Error Handling: Uses DRF exceptions caught by the global exception handler                          #
#                                                                                                       #
# Architecture:                                                                                         #
# - GenericViewSet with explicit public reads and authenticated self-service actions                    #
# - Uses PasswordService for all password operations (single source of truth)                           #
# - Uses DRF exceptions for consistent error responses via exception handler                            #
# - Uses safe_delete_file from signals for secure file deletion with MEDIA_ROOT validation              #
# - Optimized database queries with select_related to prevent N+1 query problems                        #
# - Two serializers: PublicUserSerializer (no email) vs PrivateProfileSerializer (full data)           #
# ----------------------------------------------------------------------------------------------------- #

# Django imports:
from collections.abc import Mapping

from django.contrib.auth import update_session_auth_hash
from django.conf import settings
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

# DRF imports:
from rest_framework.decorators import action
from starview_app.utils.throttles import EmailChangeThrottle
from rest_framework.permissions import IsAuthenticated
from rest_framework import status, viewsets, exceptions
from rest_framework.response import Response

# Model imports:
from django.contrib.auth.models import User
from ..models import UserProfile, Review

# Serializer imports:
from ..serializers import PublicUserSerializer, PrivateProfileSerializer, ReviewSerializer

# Service imports:
from starview_app.services import PasswordService

# Signal utility imports:
from starview_app.utils.signals import safe_delete_file


def _profile_payload(data):
    if not isinstance(data, Mapping):
        raise exceptions.ValidationError('Provide an object with profile fields.')
    return data


def _profile_text(data, field):
    value = _profile_payload(data).get(field, '')
    if not isinstance(value, str):
        raise exceptions.ValidationError(f'{field.replace("_", " ").capitalize()} must be text.')
    return value.strip()


# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                      USER PROFILE VIEWSET                                             #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# REST API ViewSet for user profiles and account management.                    #
#                                                                               #
# This ViewSet handles both:                                                    #
# 1. Public profile viewing (GET /api/users/{username}/) - No auth required    #
# 2. Private profile management (PATCH /api/users/me/*) - Auth required        #
#                                                                               #
# Public Actions (no authentication):                                           #
# - retrieve(): View any user's public profile                                  #
# - reviews(): View user's public reviews                                       #
#                                                                               #
# Private Actions (authentication required):                                    #
# - me(): Get your own full profile data                                        #
# - upload_picture(): Update profile picture                                    #
# - update_name(), update_email(), etc.: Update account settings                #
#                                                                               #
# Architecture:                                                                 #
# - Uses get_permissions() for action-level permission control                  #
# - All update actions operate on request.user (no username parameter)          #
# - Uses PublicUserSerializer (no email) vs PrivateProfileSerializer           #
# - Password operations use PasswordService for validation                      #
# - File deletion uses safe_delete_file from signals module                     #
# ----------------------------------------------------------------------------- #
class UserProfileViewSet(viewsets.GenericViewSet):
    # Do not inherit generic list/create/update/destroy: private mutations below
    # are deliberately scoped to request.user, while username routes are public.
    lookup_field = 'username'
    lookup_value_regex = '[^/]+'  # Allow any characters except forward slash
    queryset = User.objects.select_related('userprofile').all()

    def get_permissions(self):
        """
        Public actions (retrieve, reviews) don't require authentication.
        All other actions require user to be authenticated.
        """
        if self.action in ['retrieve', 'reviews']:
            return []  # No authentication required
        return [IsAuthenticated()]

    def get_serializer_class(self):
        """
        Use different serializers based on action.
        Public views get PublicUserSerializer (no email).
        Private views get PrivateProfileSerializer (with email).
        """
        if self.action == 'retrieve':
            return PublicUserSerializer
        return PrivateProfileSerializer

    # ========================================================================= #
    #                          PUBLIC ACTIONS (No Auth)                         #
    # ========================================================================= #

    # ----------------------------------------------------------------------------- #
    # Get public profile for any user by username.                                  #
    #                                                                               #
    # Returns public information only (no email, no sensitive data).                #
    # Includes user stats: review count, locations reviewed, favorites, votes.      #
    # System accounts return 404 to hide them from public access.                   #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/{username}/                                              #
    # Authentication: Not required                                                  #
    # Returns: PublicUserSerializer data                                            #
    # ----------------------------------------------------------------------------- #
    def retrieve(self, request, username=None):
        user = get_object_or_404(User.objects.select_related('userprofile'), username=username)
        # Hide system accounts from public access
        if hasattr(user, 'userprofile') and user.userprofile.is_system_account:
            raise exceptions.NotFound('User not found.')
        serializer = PublicUserSerializer(user, context={'request': request})
        return Response(serializer.data)

    # ----------------------------------------------------------------------------- #
    # Get public reviews for any user by username.                                  #
    #                                                                               #
    # Returns paginated list of user's public reviews with location info.           #
    # System accounts return 404 to hide them from public access.                   #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/{username}/reviews/                                      #
    # Authentication: Not required                                                  #
    # Returns: Paginated ReviewSerializer data                                      #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['get'], url_path='reviews')
    def reviews(self, request, username=None):
        user = get_object_or_404(User.objects.select_related('userprofile'), username=username)
        # Hide system accounts from public access
        if hasattr(user, 'userprofile') and user.userprofile.is_system_account:
            raise exceptions.NotFound('User not found.')
        reviews = Review.objects.filter(user=user).select_related(
            'location', 'user__userprofile',
        ).prefetch_related('votes', 'photos').order_by('-created_at')

        # Pagination
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        paginator.page_size = 10
        paginated_reviews = paginator.paginate_queryset(reviews, request)

        serializer = ReviewSerializer(paginated_reviews, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


    # ========================================================================= #
    #                      PRIVATE ACTIONS (Auth Required)                      #
    # ========================================================================= #

    # ----------------------------------------------------------------------------- #
    # Get authenticated user's full profile data.                                   #
    #                                                                               #
    # Returns complete profile including email, password status, and all settings.  #
    # Only accessible by the authenticated user for their own profile.              #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/me/                                                      #
    # Authentication: Required                                                      #
    # Returns: PrivateProfileSerializer data (includes email)                       #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        serializer = PrivateProfileSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], url_path='me/update-privacy')
    def update_privacy(self, request):
        """Save the owner's preference; public visibility rules are a later phase."""
        is_private = _profile_payload(request.data).get('is_private')
        if not isinstance(is_private, bool):
            raise exceptions.ValidationError({'is_private': 'Provide a boolean (true or false).'})
        profile = request.user.userprofile
        profile.is_private = is_private
        profile.save(update_fields=['is_private', 'updated_at'])
        return Response({
            'detail': 'Profile privacy preference updated.',
            'is_private': is_private,
        })

    @action(detail=False, methods=['patch'], url_path='me/update-birth-date')
    def update_birth_date(self, request):
        from starview_app.services.birth_dates import BIRTH_DATE_PROMPT_KEY, parse_birth_date
        birth_date = parse_birth_date(request.data, required=True)
        profile = request.user.userprofile
        profile.birth_date = birth_date
        profile.save(update_fields=['birth_date', 'updated_at'])
        request.session.pop(BIRTH_DATE_PROMPT_KEY, None)
        return Response({'detail': 'Date of birth updated.', 'birth_date': birth_date})

    @action(detail=False, methods=['post'], url_path='me/dismiss-birth-date-prompt')
    def dismiss_birth_date_prompt(self, request):
        from starview_app.services.birth_dates import BIRTH_DATE_PROMPT_KEY
        request.session.pop(BIRTH_DATE_PROMPT_KEY, None)
        return Response({'detail': 'Date of birth reminder dismissed.'})


    # ----------------------------------------------------------------------------- #
    # Upload new profile picture. Delete the old custom image after saving.          #
    #                                                                               #
    # Security: Validates file size (5MB max), MIME type, and extension before      #
    # processing to prevent malicious file uploads and DOS attacks.                 #
    #                                                                               #
    # HTTP Method: POST                                                             #
    # Endpoint: /api/users/me/upload-picture/                                       #
    # Authentication: Required                                                      #
    # Body: multipart/form-data with 'profile_picture' file                         #
    # Returns: DRF Response with success status and new image URL                   #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['post'], url_path='me/upload-picture')
    def upload_picture(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from starview_app.utils import validate_file_size, validate_image_file

        if 'profile_picture' not in request.FILES:
            raise exceptions.ValidationError('No image file provided')

        profile_picture = request.FILES['profile_picture']

        # Validate file before processing
        try:
            validate_file_size(profile_picture)
            validate_image_file(profile_picture)
        except DjangoValidationError as e:
            raise exceptions.ValidationError(str(e))

        user_profile = request.user.userprofile

        old_picture = user_profile.profile_picture

        # Save the new profile picture
        user_profile.profile_picture = profile_picture
        user_profile.save(update_fields=['profile_picture', 'updated_at'])
        if old_picture:
            transaction.on_commit(lambda: safe_delete_file(old_picture))

        # Check profile completion badge (may award Mission Ready)
        from starview_app.services.badge_service import BadgeService
        BadgeService.check_profile_complete_badge(request.user)

        return Response({
            'detail': 'Profile picture updated successfully',
            'image_url': user_profile.profile_picture.url
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Remove profile picture and reset to default.                                  #
    #                                                                               #
    # HTTP Method: DELETE                                                           #
    # Endpoint: /api/users/me/remove-picture/                                       #
    # Authentication: Required                                                      #
    # Returns: DRF Response with success status and default image URL               #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['delete'], url_path='me/remove-picture')
    def remove_picture(self, request):
        user_profile = request.user.userprofile

        old_picture = user_profile.profile_picture

        # Reset to default (model returns default URL when profile_picture is None)
        user_profile.profile_picture = None
        user_profile.save(update_fields=['profile_picture', 'updated_at'])
        if old_picture:
            transaction.on_commit(lambda: safe_delete_file(old_picture))

        # Check profile completion badge (may revoke Mission Ready)
        from starview_app.services.badge_service import BadgeService
        BadgeService.check_profile_complete_badge(request.user)

        return Response({
            'detail': 'Profile picture removed successfully',
            'default_image_url': user_profile.get_profile_picture_url
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's first and last name.                                            #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-name/                                          #
    # Authentication: Required                                                      #
    # Body: JSON with first_name and last_name                                      #
    # Returns: DRF Response with success status and updated names                   #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-name')
    def update_name(self, request):
        first_name = _profile_text(request.data, 'first_name')
        last_name = _profile_text(request.data, 'last_name')

        # Validate required fields
        if not first_name or not last_name:
            raise exceptions.ValidationError('Both first and last name are required.')
        for field, value in [('first_name', first_name), ('last_name', last_name)]:
            limit = User._meta.get_field(field).max_length
            if len(value) > limit:
                raise exceptions.ValidationError(f'{field.replace("_", " ").capitalize()} must be {limit} characters or less.')

        user = request.user
        user.first_name = first_name
        user.last_name = last_name
        # The request user may predate a concurrent password/security change.
        user.save(update_fields=['first_name', 'last_name'])

        return Response({
            'detail': 'Name updated successfully.',
            'first_name': first_name,
            'last_name': last_name
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's username.                                                       #
    #                                                                               #
    # Validates username format and uniqueness before updating.                     #
    # Username requirements:                                                        #
    # - 3-30 characters                                                             #
    # - Alphanumeric, underscores, and hyphens only                                 #
    # - Must be unique across all users                                             #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-username/                                      #
    # Authentication: Required                                                      #
    # Body: JSON with new_username                                                  #
    # Returns: DRF Response with success status and updated username                #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-username')
    def update_username(self, request):
        import re
        new_username = _profile_text(request.data, 'new_username').lower()

        # Validate required field
        if not new_username:
            raise exceptions.ValidationError('Username is required.')

        # Validate length
        if len(new_username) < 3:
            raise exceptions.ValidationError('Username must be at least 3 characters.')
        if len(new_username) > 30:
            raise exceptions.ValidationError('Username must be 30 characters or less.')

        # Validate format (alphanumeric, underscore, hyphen only)
        if not re.match(r'^[a-z0-9_-]+$', new_username):
            raise exceptions.ValidationError('Username can only contain letters, numbers, underscores, and hyphens.')

        # Check if username is already taken
        if User.objects.filter(username=new_username).exclude(id=request.user.id).exists():
            raise exceptions.ValidationError('This username is already taken.')

        # Update username
        user = request.user
        user.username = new_username
        try:
            with transaction.atomic():
                user.save(update_fields=['username'])
        except IntegrityError:
            # A competing account may claim the name after the availability check.
            raise exceptions.ValidationError('This username is already taken.') from None

        return Response({
            'detail': 'Username updated successfully.',
            'username': new_username
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's email address with verification flow.                           #
    #                                                                               #
    # Security: Requires verification of new email before change takes effect.      #
    # Process:                                                                      #
    # 1. Validate new email format and uniqueness                                   #
    # 2. Send notification to current email address                                 #
    # 3. Create unverified EmailAddress record for new email                        #
    # 4. Send verification link to new email address                                #
    # 5. User clicks link to confirm and complete email change                      #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-email/                                         #
    # Authentication: Required                                                      #
    # Body: JSON with new_email                                                     #
    # Returns: DRF Response with verification instructions                          #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-email', throttle_classes=[EmailChangeThrottle])
    def update_email(self, request):
        from starview_app.services.email_identity import request_email_change
        new_email = _profile_payload(request.data).get('new_email', '')
        if not isinstance(new_email, str):
            raise exceptions.ValidationError('Please enter a valid email address.')
        request_email_change(request, new_email.strip().lower())
        return Response({
            'detail': 'Check your new email for a verification link. Your current email stays active until you confirm it.',
            'verification_required': True,
            'new_email': new_email.strip().lower(),
        })


    # ----------------------------------------------------------------------------- #
    # Update user's password. Verifies current password and validates new password. #
    #                                                                               #
    # Handles two scenarios:                                                        #
    # 1. User has existing password → Requires current_password for verification   #
    # 2. User has no password (OAuth signup) → Sets first password without current #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-password/                                      #
    # Authentication: Required                                                      #
    # Body: JSON with new_password and optional current_password                    #
    # Returns: DRF Response with success status or validation error                 #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-password')
    def update_password(self, request):
        from starview_app.services.account_security import locked_account, revoke_account_sessions
        from starview_app.services.account_events import record_account_event
        data = _profile_payload(request.data)
        new_password = data.get('new_password')
        if not isinstance(new_password, str) or not new_password:
            raise exceptions.ValidationError('New password is required.')
        with locked_account(request) as user:
            if user.has_usable_password():
                current_password = data.get('current_password')
                if not isinstance(current_password, str) or not current_password:
                    raise exceptions.ValidationError('Current password is required.')
                success, error_message = PasswordService.change_password(user, current_password, new_password)
            else:
                success, error_message = PasswordService.set_password(user, new_password)
            if not success:
                raise exceptions.ValidationError(error_message)
            record_account_event(request, user, 'password_changed', method='account_settings')
            revoke_account_sessions(user, keep_request=request)
            # Refresh the request's password hash as well as the durable version.
            request.user = user
            update_session_auth_hash(request, user)

        return Response({
            'detail': 'Password updated successfully.'
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's bio text.                                                       #
    #                                                                               #
    # Bio appears on public profile and uses the model's length limit.              #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-bio/                                           #
    # Authentication: Required                                                      #
    # Body: JSON with bio (max 150 characters)                                      #
    # Returns: DRF Response with success status and updated bio                     #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-bio')
    def update_bio(self, request):
        bio = _profile_text(request.data, 'bio')

        # Validate length
        limit = UserProfile._meta.get_field('bio').max_length
        if len(bio) > limit:
            raise exceptions.ValidationError(f'Bio must be {limit} characters or less.')

        # Update bio
        profile = request.user.userprofile
        profile.bio = bio
        profile.save(update_fields=['bio', 'updated_at'])

        # Check profile completion badge (may award/revoke Mission Ready)
        from starview_app.services.badge_service import BadgeService
        BadgeService.check_profile_complete_badge(request.user)

        return Response({
            'detail': 'Bio updated successfully.',
            'bio': bio
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's unit preference (metric or imperial).                           #
    #                                                                               #
    # Controls how distances and elevations are displayed across the app.           #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-unit-preference/                               #
    # Authentication: Required                                                      #
    # Body: JSON with unit_preference ('metric' or 'imperial')                      #
    # Returns: DRF Response with success status and updated unit_preference         #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-unit-preference')
    def update_unit_preference(self, request):
        unit_preference = _profile_text(request.data, 'unit_preference').lower()

        # Validate choice
        valid_choices = ['metric', 'imperial']
        if unit_preference not in valid_choices:
            raise exceptions.ValidationError(
                f'Invalid unit preference. Must be one of: {", ".join(valid_choices)}'
            )

        # Update preference
        profile = request.user.userprofile
        profile.unit_preference = unit_preference
        profile.save(update_fields=['unit_preference', 'updated_at'])

        return Response({
            'detail': 'Unit preference updated successfully.',
            'unit_preference': unit_preference
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's language preference for UI and emails.                          #
    #                                                                               #
    # Controls the language for UI text and email notifications.                    #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-language-preference/                           #
    # Authentication: Required                                                      #
    # Body: JSON with language_preference (language code, e.g., 'en', 'es')         #
    # Returns: DRF Response with success status and updated language_preference     #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-language-preference')
    def update_language_preference(self, request):
        requested_language = _profile_text(request.data, 'language_preference')

        # Get valid language codes from settings
        valid_languages = [lang_code for lang_code, lang_name in settings.LANGUAGES]
        language_preference = next((code for code in valid_languages
                                    if code.lower() == requested_language.lower()), None)

        # Validate choice
        if language_preference not in valid_languages:
            raise exceptions.ValidationError(
                f'Invalid language preference. Must be one of: {", ".join(valid_languages)}'
            )

        # Update preference
        profile = request.user.userprofile
        profile.language_preference = language_preference
        profile.save(update_fields=['language_preference', 'updated_at'])

        return Response({
            'detail': 'Language preference updated successfully.',
            'language_preference': language_preference
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Get user's connected social accounts (Google OAuth, etc.)                     #
    #                                                                               #
    # Returns list of social accounts linked to the user with provider info,        #
    # email from the provider, and connection date.                                 #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/me/social-accounts/                                      #
    # Authentication: Required                                                      #
    # Returns: DRF Response with array of social account data                       #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['get'], url_path='me/social-accounts')
    def social_accounts(self, request):
        from allauth.socialaccount.models import SocialAccount

        accounts = SocialAccount.objects.filter(user=request.user)

        account_data = []
        for account in accounts:
            # Get email from provider's extra data
            provider_email = account.extra_data.get('email', 'N/A')

            # Get provider display name
            provider_name = account.provider.title()

            account_data.append({
                'id': account.id,
                'provider': account.provider,
                'provider_name': provider_name,
                'email': provider_email,
                'connected_at': account.date_joined,
                'uid': account.uid,
            })

        return Response({
            'social_accounts': account_data,
            'count': len(account_data)
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Disconnect a social account from user's profile                               #
    #                                                                               #
    # Removes the link between user and a specific OAuth provider. User must have   #
    # alternative login method before disconnecting a social account.      #
    #                                                                               #
    # HTTP Method: DELETE                                                           #
    # Endpoint: /api/users/me/disconnect-social/{account_id}/                       #
    # Authentication: Required                                                      #
    # Returns: DRF Response with success status                                     #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['delete'], url_path='me/disconnect-social/(?P<account_id>[^/.]+)')
    def disconnect_social(self, request, account_id=None):
        from starview_app.services.account_security import require_recent
        require_recent(request)
        from allauth.socialaccount.models import SocialAccount
        from allauth.socialaccount.signals import social_account_removed
        from starview_app.services.apple_oauth import AppleRevocationError, revoke_apple_credential

        # Serialize removals for this user so concurrent requests cannot remove
        # both remaining providers from a passwordless account.
        from starview_app.services.account_security import locked_account
        from starview_app.services.email_identity import verified_primary
        with locked_account(request) as user:
            try:
                account = SocialAccount.objects.get(id=account_id, user=user)
            except (SocialAccount.DoesNotExist, ValueError, TypeError):
                raise exceptions.NotFound('Social account not found.')
            has_other_provider = SocialAccount.objects.filter(user=user).exclude(pk=account.pk).exists()
            # Password login also requires a verified primary email in custom_login.
            can_use_password = user.has_usable_password() and verified_primary(user)
            if not can_use_password and not has_other_provider:
                raise exceptions.ValidationError({
                    'detail': 'Before disconnecting your last sign-in method, connect another account or set a password and verify your profile email.'
                })
            provider_name = account.provider.title()
            revoked = None
            try:
                if account.provider == 'apple':
                    revoked = revoke_apple_credential(account)
                account.delete()
            except AppleRevocationError as exc:
                error = exceptions.APIException(str(exc))
                error.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
                raise error from None

            social_account_removed.send(sender=SocialAccount, request=request, socialaccount=account)
        detail = f'{provider_name} account disconnected successfully.'
        if account.provider == 'apple' and revoked is False:
            detail += ' Also remove Starview under Sign in with Apple in your Apple Account settings; this older connection had no saved revocation credential.'

        return Response({
            'detail': detail,
            'provider': account.provider,
            'authorization_revoked': revoked,
        }, status=status.HTTP_200_OK)
