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
# - Profile Updates: AJAX endpoints for profile pictures, names, email, passwords, bio, location       #
# - Password Security: Integrates with PasswordService for consistent validation across the app         #
# - Error Handling: Uses DRF exceptions caught by the global exception handler                          #
#                                                                                                       #
# Architecture:                                                                                         #
# - ModelViewSet with action-level permissions (public vs authenticated)                                #
# - Uses PasswordService for all password operations (single source of truth)                           #
# - Uses DRF exceptions for consistent error responses via exception handler                            #
# - Uses safe_delete_file from signals for secure file deletion with MEDIA_ROOT validation              #
# - Optimized database queries with select_related to prevent N+1 query problems                        #
# - Two serializers: PublicUserSerializer (no email) vs PrivateProfileSerializer (full data)           #
# ----------------------------------------------------------------------------------------------------- #

# Django imports:
from django.contrib.auth import update_session_auth_hash
from django.views.decorators.http import require_POST
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.conf import settings
from django.shortcuts import get_object_or_404

# DRF imports:
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework import status, viewsets, exceptions
from rest_framework.response import Response

# Model imports:
from django.contrib.auth.models import User
from ..models import UserProfile, Review, FavoriteLocation

# Serializer imports:
from ..serializers import PublicUserSerializer, PrivateProfileSerializer, ReviewSerializer

# Service imports:
from starview_app.services import PasswordService

# Signal utility imports:
from starview_app.utils.signals import safe_delete_file



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
class UserProfileViewSet(viewsets.ModelViewSet):
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
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/{username}/                                              #
    # Authentication: Not required                                                  #
    # Returns: PublicUserSerializer data                                            #
    # ----------------------------------------------------------------------------- #
    def retrieve(self, request, username=None):
        user = get_object_or_404(User.objects.select_related('userprofile'), username=username)
        serializer = PublicUserSerializer(user, context={'request': request})
        return Response(serializer.data)

    # ----------------------------------------------------------------------------- #
    # Get public reviews for any user by username.                                  #
    #                                                                               #
    # Returns paginated list of user's public reviews with location info.           #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/users/{username}/reviews/                                      #
    # Authentication: Not required                                                  #
    # Returns: Paginated ReviewSerializer data                                      #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['get'], url_path='reviews')
    def reviews(self, request, username=None):
        user = get_object_or_404(User, username=username)
        reviews = Review.objects.filter(user=user).select_related('location', 'user__userprofile').order_by('-created_at')

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


    # ----------------------------------------------------------------------------- #
    # Upload new profile picture. Automatically deletes old custom images           #
    # (preserves default images) before saving the new one.                         #
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

        # Delete old profile picture if it exists (None means using default, so nothing to delete)
        # Pass the FileField object directly (works with both local and R2/S3 storage)
        if user_profile.profile_picture:
            safe_delete_file(user_profile.profile_picture)

        # Save the new profile picture
        user_profile.profile_picture = profile_picture
        user_profile.save()

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

        # Delete the current profile picture if it exists (None means using default)
        # Pass the FileField object directly (works with both local and R2/S3 storage)
        if user_profile.profile_picture:
            safe_delete_file(user_profile.profile_picture)

        # Reset to default (model returns default URL when profile_picture is None)
        user_profile.profile_picture = None
        user_profile.save()

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
        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()

        # Validate required fields
        if not first_name or not last_name:
            raise exceptions.ValidationError('Both first and last name are required.')

        user = request.user
        user.first_name = first_name
        user.last_name = last_name
        user.save()

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
        new_username = request.data.get('new_username', '').strip().lower()

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
        user.save()

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
    @action(detail=False, methods=['patch'], url_path='me/update-email')
    def update_email(self, request):
        from allauth.account.models import EmailAddress
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string

        new_email = request.data.get('new_email', '').strip()

        # Validate the new email
        if not new_email:
            raise exceptions.ValidationError('Email address is required.')

        # Validate email format using Django's built-in validator
        try:
            validate_email(new_email)
        except ValidationError:
            raise exceptions.ValidationError('Please enter a valid email address.')

        # Check if this is the same as current email
        if request.user.email.lower() == new_email.lower():
            raise exceptions.ValidationError('This is already your current email address.')

        # Check if email is already taken by another user
        if User.objects.filter(email=new_email.lower()).exclude(id=request.user.id).exists():
            raise exceptions.ValidationError('This email address is already registered.')

        # Check if email is already in use by a social account (from ANY user including self)
        from allauth.socialaccount.models import SocialAccount
        for social_account in SocialAccount.objects.all():
            social_email = social_account.extra_data.get('email', '').lower()
            if social_email == new_email.lower():
                # Block the change - this email is used by a social account
                raise exceptions.ValidationError('This email address is already registered.')

        # Check if email has a pending verification (unverified EmailAddress record)
        # This prevents race conditions where multiple users try to claim the same email
        pending_email = EmailAddress.objects.filter(
            email=new_email.lower(),
            verified=False
        ).exclude(user=request.user).first()

        if pending_email:
            raise exceptions.ValidationError('This email address is already registered.')

        # Send notification to old email address
        old_email = request.user.email
        if old_email:
            from django.contrib.sites.shortcuts import get_current_site

            current_site = get_current_site(request)
            context = {
                'user': request.user,
                'old_email': old_email,
                'new_email': new_email,
                'site_name': current_site.name,
            }

            # Render email subject and body from templates
            subject = render_to_string('account/email/email_change_subject.txt', context).strip()
            html_content = render_to_string('account/email/email_change_message.html', context)
            text_content = render_to_string('account/email/email_change_message.txt', context)

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[old_email]
            )
            email.attach_alternative(html_content, "text/html")
            email.send(fail_silently=True)

        # Get or create EmailAddress record for new email (unverified)
        email_address, created = EmailAddress.objects.get_or_create(
            user=request.user,
            email=new_email.lower(),
            defaults={'verified': False, 'primary': False}
        )

        # If email already exists and is verified, make it primary immediately
        if not created and email_address.verified:
            email_address.set_as_primary()
            # Update User model email
            request.user.email = new_email.lower()
            request.user.save()
            return Response({
                'detail': 'Email updated successfully.',
                'new_email': new_email,
                'verification_required': False
            }, status=status.HTTP_200_OK)

        # Email is unverified, send verification email
        email_address.send_confirmation(request)

        return Response({
            'detail': f'Verification email sent to {new_email}. Please check your inbox and click the verification link to complete the email change.',
            'verification_required': True,
            'new_email': new_email
        }, status=status.HTTP_200_OK)


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
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')

        # Validate new password is provided
        if not new_password:
            raise exceptions.ValidationError('New password is required.')

        # Check if user has a usable password (not OAuth-only account)
        if request.user.has_usable_password():
            # User has existing password - require current password for verification
            if not current_password:
                raise exceptions.ValidationError('Current password is required.')

            # Use PasswordService to validate and change password
            success, error_message = PasswordService.change_password(
                user=request.user,
                current_password=current_password,
                new_password=new_password
            )
        else:
            # User has no password (OAuth signup) - set first password
            success, error_message = PasswordService.set_password(
                user=request.user,
                new_password=new_password
            )

        if not success:
            raise exceptions.ValidationError(error_message)

        # Update session to prevent logout after password change
        update_session_auth_hash(request, request.user)

        return Response({
            'detail': 'Password updated successfully.'
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's bio text.                                                       #
    #                                                                               #
    # Bio appears on public profile and is limited to 500 characters.               #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-bio/                                           #
    # Authentication: Required                                                      #
    # Body: JSON with bio (max 500 characters)                                      #
    # Returns: DRF Response with success status and updated bio                     #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-bio')
    def update_bio(self, request):
        bio = request.data.get('bio', '').strip()

        # Validate length
        if len(bio) > 500:
            raise exceptions.ValidationError('Bio must be 500 characters or less.')

        # Update bio
        profile = request.user.userprofile
        profile.bio = bio
        profile.save()

        return Response({
            'detail': 'Bio updated successfully.',
            'bio': bio
        }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Update user's location with optional coordinates.                             #
    #                                                                               #
    # Location text appears on public profile (e.g., "Seattle, Washington, US").    #
    # Coordinates are stored privately and never exposed in API responses.          #
    #                                                                               #
    # HTTP Method: PATCH                                                            #
    # Endpoint: /api/users/me/update-location/                                      #
    # Authentication: Required                                                      #
    # Body: JSON with location (max 100 chars), optional latitude/longitude         #
    # Returns: DRF Response with success status and updated location text only      #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['patch'], url_path='me/update-location')
    def update_location(self, request):
        location = request.data.get('location', '').strip()
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')

        # Validate location text length
        if len(location) > 100:
            raise exceptions.ValidationError('Location must be 100 characters or less.')

        profile = request.user.userprofile

        # Handle clearing location (empty string clears everything)
        if not location:
            profile.location = ''
            profile.location_latitude = None
            profile.location_longitude = None
        else:
            profile.location = location
            # Store coordinates if provided (model validators handle range validation)
            if latitude is not None and longitude is not None:
                profile.location_latitude = float(latitude)
                profile.location_longitude = float(longitude)
            else:
                # Location text without coordinates (fallback for manual entry)
                profile.location_latitude = None
                profile.location_longitude = None

        profile.save()

        # Only return location text - coordinates are private
        return Response({
            'detail': 'Location updated successfully.',
            'location': profile.location
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
        unit_preference = request.data.get('unit_preference', '').strip().lower()

        # Validate choice
        valid_choices = ['metric', 'imperial']
        if unit_preference not in valid_choices:
            raise exceptions.ValidationError(
                f'Invalid unit preference. Must be one of: {", ".join(valid_choices)}'
            )

        # Update preference
        profile = request.user.userprofile
        profile.unit_preference = unit_preference
        profile.save()

        return Response({
            'detail': 'Unit preference updated successfully.',
            'unit_preference': unit_preference
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
    # alternative login method (password) before disconnecting social account.      #
    #                                                                               #
    # HTTP Method: DELETE                                                           #
    # Endpoint: /api/users/me/disconnect-social/{account_id}/                       #
    # Authentication: Required                                                      #
    # Returns: DRF Response with success status                                     #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['delete'], url_path='me/disconnect-social/(?P<account_id>[^/.]+)')
    def disconnect_social(self, request, account_id=None):
        from allauth.socialaccount.models import SocialAccount

        try:
            account = SocialAccount.objects.get(id=account_id, user=request.user)
        except SocialAccount.DoesNotExist:
            raise exceptions.NotFound('Social account not found.')

        # Check if user has a password (can't disconnect if no alternative login method)
        if not request.user.has_usable_password():
            raise exceptions.ValidationError(
                'Cannot disconnect social account. Please set a password first to ensure you can still login.'
            )

        # Store provider name for response
        provider_name = account.provider.title()

        # Delete the social account
        account.delete()

        return Response({
            'detail': f'{provider_name} account disconnected successfully.',
            'provider': account.provider
        }, status=status.HTTP_200_OK)
