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
# - Profile picture URLs: Provides absolute URLs for image display                                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from rest_framework import serializers
from django.contrib.auth.models import User


def _public_stats(user_ids):
    """Aggregate one public profile or a page without per-profile queries."""
    from django.db.models import Count
    from starview_app.models import Review, FavoriteLocation, Follow, Vote

    stats = {user_id: {
        'review_count': 0, 'locations_reviewed': 0, 'favorite_count': 0,
        'helpful_votes_received': 0, 'follower_count': 0, 'following_count': 0,
    } for user_id in user_ids}
    if not stats:
        return stats
    reviews = Review.objects.filter(user_id__in=user_ids).values('user_id').annotate(
        review_count=Count('id'), locations_reviewed=Count('location_id', distinct=True),
    )
    for row in reviews:
        stats[row['user_id']].update({key: row[key] for key in ('review_count', 'locations_reviewed')})
    counts = (
        (FavoriteLocation.objects.filter(user_id__in=user_ids), 'user_id', 'favorite_count'),
        (Vote.objects.filter(review__user_id__in=user_ids, is_upvote=True), 'review__user_id', 'helpful_votes_received'),
        (Follow.objects.filter(following_id__in=user_ids), 'following_id', 'follower_count'),
        (Follow.objects.filter(follower_id__in=user_ids), 'follower_id', 'following_count'),
    )
    for queryset, owner, field in counts:
        for row in queryset.order_by().values(owner).annotate(total=Count('id')):
            stats[row[owner]][field] = row['total']
    return stats


class PublicUserListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        users = list(data.all() if hasattr(data, 'all') else data)
        user_ids = [user.pk for user in users]
        self.context['public_user_stats'] = _public_stats(user_ids)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from starview_app.models import Follow
            self.context['public_following_ids'] = set(Follow.objects.filter(
                follower=request.user, following_id__in=user_ids,
            ).values_list('following_id', flat=True))
        return super().to_representation(users)



# ----------------------------------------------------------------------------- #
# Public User Serializer - Used for public profile viewing                      #
#                                                                               #
# Returns only public information about a user. NO email, NO sensitive data.    #
# Used by: GET /api/users/{username}/                                           #
# ----------------------------------------------------------------------------- #
class PublicUserSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    bio = serializers.CharField(source='userprofile.bio', read_only=True)
    is_verified = serializers.BooleanField(source='userprofile.is_verified', read_only=True)
    stats = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    pinned_badge_ids = serializers.ListField(source='userprofile.pinned_badge_ids', read_only=True)

    class Meta:
        model = User
        list_serializer_class = PublicUserListSerializer
        fields = ['id', 'username', 'first_name', 'last_name', 'date_joined',
                  'profile_picture_url', 'bio', 'is_verified', 'stats', 'is_following',
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
        if 'public_following_ids' in self.context:
            return obj.pk in self.context['public_following_ids']

        from starview_app.models import Follow
        return Follow.objects.filter(
            follower=request.user,
            following=obj
        ).exists()

    def get_stats(self, obj):
        """Get user's public statistics"""
        stats = self.context.get('public_user_stats')
        return stats[obj.pk] if stats is not None else _public_stats([obj.pk])[obj.pk]


# ----------------------------------------------------------------------------- #
# Private Profile Serializer - Used for authenticated user's own profile        #
#                                                                               #
# Returns full profile data including email and private fields.                 #
# Used by: GET /api/users/me/                                                   #
# ----------------------------------------------------------------------------- #
class PrivateProfileSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    bio = serializers.CharField(source='userprofile.bio', read_only=True)
    is_verified = serializers.BooleanField(source='userprofile.is_verified', read_only=True)
    has_usable_password = serializers.BooleanField(read_only=True)
    pinned_badge_ids = serializers.ListField(source='userprofile.pinned_badge_ids', read_only=True)
    unit_preference = serializers.CharField(source='userprofile.unit_preference', read_only=True)
    language_preference = serializers.CharField(source='userprofile.language_preference', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'date_joined',
                  'profile_picture_url', 'bio', 'is_verified', 'has_usable_password',
                  'pinned_badge_ids', 'unit_preference', 'language_preference']
        # This serializer is output-only. Profile changes use validated /me actions.
        read_only_fields = fields

    def get_profile_picture_url(self, obj):
        """Get user's profile picture URL"""
        return obj.userprofile.get_profile_picture_url
