# ----------------------------------------------------------------------------------------------------- #
# This serializer_review.py file defines serializers for review-related models:                         #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides REST Framework serializers for transforming Review, ReviewComment, and ReviewPhoto models    #
# between Python objects and JSON for API responses. Handles validation, nested relationships, and      #
# computed fields like vote counts and user-specific data.                                              #
#                                                                                                       #
# Key Features:                                                                                         #
# - ReviewSerializer: Full review data with photos, vote counts, and user vote status                   #
# - ReviewCommentSerializer: Comment data with user info and vote tracking                              #
# - ReviewPhotoSerializer: Photo URLs with thumbnails for image display                                 #
# - Vote optimization: Leverages model @property methods instead of duplicate queries                   #
# - User context: Includes authenticated user's vote status on reviews/comments                         #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from rest_framework import serializers
from ..models import Review
from ..models import ReviewComment
from ..models import ReviewPhoto
from ..models import Vote



class ReviewCommentSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    user_profile_picture = serializers.SerializerMethodField()
    upvote_count = serializers.ReadOnlyField()
    downvote_count = serializers.ReadOnlyField()
    user_vote = serializers.SerializerMethodField()
    is_edited = serializers.ReadOnlyField()

    # Explicit field validation (defense in depth - also validated at model level)
    content = serializers.CharField(max_length=500, min_length=1)

    class Meta:
        model = ReviewComment
        fields = ['id', 'review', 'user', 'user_profile_picture', 'content',
                  'created_at', 'upvote_count', 'downvote_count', 'user_vote', 'is_edited']
        read_only_fields = ['id', 'user', 'review', 'created_at']

    def get_user(self, obj):
        # Return full user information needed by frontend
        return {
            'username': obj.user.username,
            'profile_picture_url': obj.user.userprofile.get_profile_picture_url
        }

    def get_user_profile_picture(self, obj):
        # Get the user's profile picture URL
        return obj.user.userprofile.get_profile_picture_url

    def get_user_vote(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Use prefetched votes if available to avoid N+1 queries
            if hasattr(obj, '_prefetched_objects_cache') and 'votes' in obj._prefetched_objects_cache:
                # Filter prefetched votes for current user
                user_votes = [v for v in obj.votes.all() if v.user_id == request.user.id]
                if user_votes:
                    return 'up' if user_votes[0].is_upvote else 'down'
                return None
            else:
                # Fallback to model method if votes not prefetched
                return obj.get_user_vote(request.user)
        return None



class ReviewPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ReviewPhoto
        fields = ['id', 'image', 'thumbnail', 'caption', 'order',
                  'image_url', 'thumbnail_url', 'created_at']
        read_only_fields = ['id', 'thumbnail', 'created_at']

    def get_image_url(self, obj):
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image_url if obj.image else None

    def get_thumbnail_url(self, obj):
        request = self.context.get('request')
        if obj.thumbnail and request:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail_url if obj.thumbnail else None



class ReviewSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    user_full_name = serializers.SerializerMethodField()
    vote_count = serializers.ReadOnlyField()
    upvote_count = serializers.ReadOnlyField()
    downvote_count = serializers.ReadOnlyField()
    user_vote = serializers.SerializerMethodField()
    photos = ReviewPhotoSerializer(many=True, read_only=True)
    is_edited = serializers.ReadOnlyField()

    # Explicit field validation (defense in depth - also validated at model level)
    rating = serializers.IntegerField(min_value=1, max_value=5)

    class Meta:
        model = Review
        fields = ['id', 'location', 'user', 'user_full_name',
                 'rating', 'comment', 'created_at', 'updated_at',
                  'vote_count', 'upvote_count', 'downvote_count', 'user_vote', 'photos', 'is_edited']
        read_only_fields = ['id', 'user', 'location', 'created_at', 'updated_at']

    def get_user_full_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_user_vote(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Use prefetched votes if available to avoid N+1 queries
            if hasattr(obj, '_prefetched_objects_cache') and 'votes' in obj._prefetched_objects_cache:
                # Filter prefetched votes for current user
                user_votes = [v for v in obj.votes.all() if v.user_id == request.user.id]
                if user_votes:
                    return 'up' if user_votes[0].is_upvote else 'down'
            else:
                # Fallback to querying if votes not prefetched
                from django.contrib.contenttypes.models import ContentType
                content_type = ContentType.objects.get_for_model(obj)

                vote = Vote.objects.filter(
                    user=request.user,
                    content_type=content_type,
                    object_id=obj.id
                ).first()

                # Convert boolean to string representation
                if vote is not None:  # Check if vote exists
                    return 'up' if vote.is_upvote else 'down'
        return None  # Return None if no vote exists
