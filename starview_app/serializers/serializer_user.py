# ----------------------------------------------------------------------------------------------------- #
# This serializer_user.py file defines serializers for user-related models:                             #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides REST Framework serializers for transforming User and UserProfile models between Python       #
# objects and JSON for API responses. Handles user authentication data and profile information.         #
#                                                                                                       #
# Key Features:                                                                                         #
# - PublicUserSerializer: Public profile data (no email/sensitive fields) for public viewing           #
# - PrivateProfileSerializer: Full profile data including email for authenticated user                  #
# - UserProfileSerializer: Profile picture with URL generation (legacy)                                 #
# - UserSerializer: Core Django User model with nested profile data (legacy)                            #
# - Profile picture URLs: Provides absolute URLs for image display                                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from rest_framework import serializers
from django.contrib.auth.models import User
from starview_app.models.model_user_profile import UserProfile



class UserProfileSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    profile_picture_url = serializers.ReadOnlyField(source='get_profile_picture_url')

    class Meta:
        model = UserProfile
        fields = ['id', 'user', 'profile_picture', 'profile_picture_url',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']



class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(source='userprofile', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'date_joined', 'profile']
        read_only_fields = ['id', 'username', 'date_joined']


# ----------------------------------------------------------------------------- #
# Public User Serializer - Used for public profile viewing                      #
#                                                                               #
# Returns only public information about a user. NO email, NO sensitive data.    #
# Used by: GET /api/users/{username}/                                           #
# ----------------------------------------------------------------------------- #
class PublicUserSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    bio = serializers.CharField(source='userprofile.bio', read_only=True)
    location = serializers.CharField(source='userprofile.location', read_only=True)
    is_verified = serializers.BooleanField(source='userprofile.is_verified', read_only=True)
    stats = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    pinned_badge_ids = serializers.ListField(source='userprofile.pinned_badge_ids', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'date_joined',
                  'profile_picture_url', 'bio', 'location', 'is_verified', 'stats', 'is_following',
                  'pinned_badge_ids']
        read_only_fields = ['id', 'username', 'first_name', 'last_name', 'date_joined']

    def get_profile_picture_url(self, obj):
        """Get user's profile picture URL"""
        return obj.userprofile.get_profile_picture_url

    def get_is_following(self, obj):
        """Check if the requesting user is following this user"""
        request = self.context.get('request')

        # If no request context or user is not authenticated, return None
        if not request or not request.user.is_authenticated:
            return None

        # Don't check for own profile
        if request.user == obj:
            return None

        from starview_app.models import Follow
        return Follow.objects.filter(
            follower=request.user,
            following=obj
        ).exists()

    def get_stats(self, obj):
        """Get user's public statistics"""
        from starview_app.models import Review, FavoriteLocation, Follow
        from django.db.models import Count, Sum
        from django.contrib.contenttypes.models import ContentType

        # Get review count and locations reviewed count
        review_count = Review.objects.filter(user=obj).count()
        locations_reviewed = Review.objects.filter(user=obj).values('location').distinct().count()

        # Get favorite count
        favorite_count = FavoriteLocation.objects.filter(user=obj).count()

        # Get helpful votes received (upvotes on user's reviews)
        from starview_app.models import Vote
        review_ct = ContentType.objects.get_for_model(Review)
        user_review_ids = Review.objects.filter(user=obj).values_list('id', flat=True)
        helpful_votes = Vote.objects.filter(
            content_type=review_ct,
            object_id__in=user_review_ids,
            is_upvote=True  # Upvotes only
        ).count()

        # Get follower/following counts
        follower_count = Follow.objects.filter(following=obj).count()
        following_count = Follow.objects.filter(follower=obj).count()

        return {
            'review_count': review_count,
            'locations_reviewed': locations_reviewed,
            'favorite_count': favorite_count,
            'helpful_votes_received': helpful_votes,
            'follower_count': follower_count,
            'following_count': following_count
        }


# ----------------------------------------------------------------------------- #
# Private Profile Serializer - Used for authenticated user's own profile        #
#                                                                               #
# Returns full profile data including email and private fields.                 #
# Used by: GET /api/users/me/                                                   #
# ----------------------------------------------------------------------------- #
class PrivateProfileSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    bio = serializers.CharField(source='userprofile.bio', read_only=True)
    location = serializers.CharField(source='userprofile.location', read_only=True)
    is_verified = serializers.BooleanField(source='userprofile.is_verified', read_only=True)
    has_usable_password = serializers.BooleanField(read_only=True)
    pinned_badge_ids = serializers.ListField(source='userprofile.pinned_badge_ids', read_only=True)
    unit_preference = serializers.CharField(source='userprofile.unit_preference', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'date_joined',
                  'profile_picture_url', 'bio', 'location', 'is_verified', 'has_usable_password',
                  'pinned_badge_ids', 'unit_preference']
        read_only_fields = ['id', 'username', 'date_joined', 'has_usable_password']

    def get_profile_picture_url(self, obj):
        """Get user's profile picture URL"""
        return obj.userprofile.get_profile_picture_url
