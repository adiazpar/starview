# ----------------------------------------------------------------------------------------------------- #
# This serializer_location.py file defines serializers for location-related models:                     #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides REST Framework serializers for transforming Location models between Python objects and       #
# JSON. Includes optimized serializers for different use cases (full details, map markers, info panel). #
#                                                                                                       #
# Key Features:                                                                                         #
# - LocationSerializer: Full location data with reviews, ratings, and user-specific context             #
# - MapLocationSerializer: Lightweight (97% reduction) for map marker display only                      #
# - LocationInfoPanelSerializer: Optimized (95% reduction) for map info panel clicks                    #
# - Performance optimization: Different serializers for different UI needs                              #
# - User context: Includes authenticated user's favorite status                                         #
#                                                                                                       #
# Performance Impact:                                                                                   #
# - Full LocationSerializer: ~7KB per location (with nested reviews/photos/votes)                       #
# - MapLocationSerializer: ~30 bytes per location (id, name, lat, lng, quality)                         #
# - LocationInfoPanelSerializer: ~300 bytes per location (basic info + stats only)                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.conf import settings
from django.db.models import Avg
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers
from ..models import Location
from ..models import FavoriteLocation
from ..models import LocationVisit
from ..models import LocationPhoto
from ..models import ReviewPhoto
from ..models import Vote
from . import ReviewSerializer


def get_user_attribution(user):
    """
    Returns user attribution data for photo overlays.
    Used by get_images() to include uploader info for each photo.
    """
    if not user:
        return None

    # Get display name (full name or username fallback)
    full_name = f"{user.first_name} {user.last_name}".strip()
    display_name = full_name if full_name else user.username

    # Get profile picture URL and system account flag
    profile_picture = settings.DEFAULT_PROFILE_PICTURE
    is_system_account = False
    if hasattr(user, 'userprofile') and user.userprofile:
        profile_picture = user.userprofile.get_profile_picture_url
        is_system_account = user.userprofile.is_system_account

    return {
        'username': user.username,
        'display_name': display_name,
        'profile_picture': profile_picture,
        'is_system_account': is_system_account,
    }


def get_images_with_votes(obj, request):
    """
    Return up to 5 images from hybrid pool (location + review photos),
    sorted by upvote_count DESC, created_at DESC, with user attribution and vote data.

    Args:
        obj: Location instance
        request: HTTP request (for user vote status)

    Returns:
        List of photo dicts with id, thumbnail, full, uploaded_by, uploaded_at,
        upvote_count, and user_has_upvoted fields.
    """
    photos = []
    user = request.user if request and request.user.is_authenticated else None

    # 1. Collect all location photos
    if hasattr(obj, 'prefetched_location_photos'):
        location_photos = list(obj.prefetched_location_photos)
    else:
        location_photos = list(obj.photos.select_related('uploaded_by__userprofile').order_by('-created_at')[:10])

    # 2. Collect all review photos
    review_photos_with_user = []
    if hasattr(obj, 'prefetched_reviews'):
        reviews = obj.prefetched_reviews
    else:
        reviews = obj.reviews.select_related('user__userprofile').prefetch_related('photos').order_by('-created_at')

    for review in reviews:
        if hasattr(review, 'prefetched_photos'):
            for photo in review.prefetched_photos:
                review_photos_with_user.append((photo, review.user))
        else:
            for photo in review.photos.all().order_by('order'):
                review_photos_with_user.append((photo, review.user))

    # 3. Get vote counts for all photos in batch
    loc_photo_ids = [p.id for p in location_photos]
    rev_photo_ids = [rp[0].id for rp in review_photos_with_user]

    loc_ct = ContentType.objects.get_for_model(LocationPhoto) if loc_photo_ids else None
    rev_ct = ContentType.objects.get_for_model(ReviewPhoto) if rev_photo_ids else None

    # Get vote counts per photo
    loc_vote_counts = {}
    rev_vote_counts = {}

    if loc_ct and loc_photo_ids:
        from django.db.models import Count
        votes_qs = Vote.objects.filter(
            content_type=loc_ct,
            object_id__in=loc_photo_ids,
            is_upvote=True
        ).values('object_id').annotate(count=Count('id'))
        loc_vote_counts = {v['object_id']: v['count'] for v in votes_qs}

    if rev_ct and rev_photo_ids:
        from django.db.models import Count
        votes_qs = Vote.objects.filter(
            content_type=rev_ct,
            object_id__in=rev_photo_ids,
            is_upvote=True
        ).values('object_id').annotate(count=Count('id'))
        rev_vote_counts = {v['object_id']: v['count'] for v in votes_qs}

    # Get user's votes if authenticated
    user_loc_votes = set()
    user_rev_votes = set()

    if user:
        if loc_ct and loc_photo_ids:
            user_loc_votes = set(Vote.objects.filter(
                user=user,
                content_type=loc_ct,
                object_id__in=loc_photo_ids,
                is_upvote=True
            ).values_list('object_id', flat=True))

        if rev_ct and rev_photo_ids:
            user_rev_votes = set(Vote.objects.filter(
                user=user,
                content_type=rev_ct,
                object_id__in=rev_photo_ids,
                is_upvote=True
            ).values_list('object_id', flat=True))

    # 4. Build photo list with vote data
    all_photos = []

    for photo in location_photos:
        uploader = photo.uploaded_by if photo.uploaded_by else obj.added_by
        upvote_count = loc_vote_counts.get(photo.id, 0)
        all_photos.append({
            'id': f'loc_{photo.id}',
            'thumbnail': photo.thumbnail_url,
            'full': photo.image_url,
            'uploaded_by': get_user_attribution(uploader),
            'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
            'upvote_count': upvote_count,
            'user_has_upvoted': photo.id in user_loc_votes,
            '_sort_date': photo.created_at,
        })

    for photo, review_user in review_photos_with_user:
        upvote_count = rev_vote_counts.get(photo.id, 0)
        all_photos.append({
            'id': f'rev_{photo.id}',
            'thumbnail': photo.thumbnail_url,
            'full': photo.image_url,
            'uploaded_by': get_user_attribution(review_user),
            'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
            'upvote_count': upvote_count,
            'user_has_upvoted': photo.id in user_rev_votes,
            '_sort_date': photo.created_at,
        })

    # 5. Sort by upvote_count DESC, then created_at DESC (most recent first)
    all_photos.sort(key=lambda p: (-p['upvote_count'], -(p['_sort_date'].timestamp() if p['_sort_date'] else 0)))

    # 6. Remove internal sort field and limit to 5
    for p in all_photos:
        del p['_sort_date']

    return all_photos[:5]


def get_total_photo_count(obj):
    """
    Return total count of photos for a location (LocationPhoto + ReviewPhoto).
    Uses prefetched data if available for efficiency.
    """
    # Count location photos
    if hasattr(obj, 'prefetched_location_photos'):
        loc_count = len(obj.prefetched_location_photos)
    else:
        loc_count = obj.photos.count()

    # Count review photos
    rev_count = 0
    if hasattr(obj, 'prefetched_reviews'):
        for review in obj.prefetched_reviews:
            if hasattr(review, 'prefetched_photos'):
                rev_count += len(review.prefetched_photos)
            else:
                rev_count += review.photos.count()
    else:
        from ..models import ReviewPhoto
        rev_count = ReviewPhoto.objects.filter(review__location=obj).count()

    return loc_count + rev_count


# ----------------------------------------------------------------------------- #
# Full location serializer with nested reviews (for detail view).               #
#                                                                               #
# SCALABILITY WARNING:                                                          #
# This serializer includes ALL reviews for a location as nested data. This is   #
# fine for locations with 1-20 reviews (~7KB response), but can become slow     #
# for locations with 100+ reviews (hundreds of KB).                             #
#                                                                               #
# Current Performance (with optimizations):                                     #
# - 1 location with 5 reviews: 9 queries, ~7KB - ✅ Fast                        #
# - 1 location with 100 reviews: Would be slow and large payload               #
#                                                                               #
# RECOMMENDED FRONTEND PATTERN:                                                 #
# Instead of using this serializer's nested reviews, fetch reviews separately:  #
#   1. GET /api/locations/{id}/ - Use LocationListSerializer (no nested reviews)#
#   2. GET /api/locations/{id}/reviews/?page=1 - Paginated reviews (20 per page)#
#                                                                               #
# TO IMPLEMENT: Change get_serializer_class() in LocationViewSet to return     #
# LocationListSerializer for 'retrieve' action, not just 'list' action.        #
# ----------------------------------------------------------------------------- #
class LocationSerializer(serializers.ModelSerializer):
    added_by = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()
    is_visited = serializers.SerializerMethodField()
    verified_by = serializers.SerializerMethodField()
    location_type_display = serializers.SerializerMethodField()

    reviews = ReviewSerializer(many=True, read_only=True)  # ⚠️ Returns ALL reviews - see warning above
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    review_summary = serializers.SerializerMethodField()  # AI-generated summary
    user_summary_feedback = serializers.SerializerMethodField()  # User's feedback on summary
    # Note: images and photo_count removed - PhotoMosaic now fetches from /photos/ endpoint

    class Meta:
        model = Location
        fields = ['id', 'name', 'description', 'location_type', 'location_type_display', 'type_metadata',
                  'latitude', 'longitude', 'elevation',
                  'bortle_class', 'bortle_sqm',
                  'formatted_address', 'administrative_area', 'locality', 'country',
                  'added_by',
                  'created_at', 'is_favorited', 'is_visited',
                  'reviews', 'average_rating', 'review_count', 'review_summary', 'user_summary_feedback',

                  # Verification fields:
                  'is_verified', 'verification_date', 'verified_by',
                  'times_reported', 'last_visited', 'visitor_count'
                  ]

        read_only_fields = ['id', 'description', 'added_by',
                          'created_at', 'formatted_address', 'administrative_area',
                          'locality', 'country', 'type_metadata',
                          'bortle_class', 'bortle_sqm',

                            # Verification fields are read-only (managed by system)
                            # Note: verification_notes excluded (staff-only internal data)
                            'is_verified', 'verification_date', 'verified_by',
                            'times_reported', 'last_visited', 'visitor_count'
                            ]

    def get_location_type_display(self, obj):
        """Return human-readable location type name."""
        return obj.get_location_type_display()


    def get_added_by(self, obj):
        return {
            'id': obj.added_by.id,
            'username': obj.added_by.username
        } if obj.added_by else None


    def get_average_rating(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'average_rating_annotated'):
            return obj.average_rating_annotated
        return obj.reviews.aggregate(avg_rating=Avg('rating'))['avg_rating']


    def get_review_count(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'review_count_annotated'):
            return obj.review_count_annotated
        return obj.reviews.count()


    def get_is_favorited(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'is_favorited_annotated'):
            return obj.is_favorited_annotated

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return FavoriteLocation.objects.filter(
                user=request.user,
                location=obj
            ).exists()

        # Otherwise return false since no favorites:
        return False


    def get_is_visited(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'is_visited_annotated'):
            return obj.is_visited_annotated

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return LocationVisit.objects.filter(
                user=request.user,
                location=obj
            ).exists()

        return False


    def get_verified_by(self, obj):
        if obj.verified_by:
            return {
                'id': obj.verified_by.id,
                'username': obj.verified_by.username
            }
        return None

    def get_review_summary(self, obj):
        """Return AI-generated review summary (lazy generation on first view)."""
        from starview_app.services.review_summary_service import ReviewSummaryService
        return ReviewSummaryService.get_or_generate_summary(obj)

    def get_user_summary_feedback(self, obj):
        """Return user's feedback on the AI summary: 'yes', 'no', or None."""
        from starview_app.services.summary_feedback_service import SummaryFeedbackService
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return SummaryFeedbackService.get_user_feedback(request.user, obj)
        return None

    # Note: get_images and get_photo_count removed - PhotoMosaic now fetches from /photos/ endpoint


# ----------------------------------------------------------------------------- #
# Optimized serializer for map marker display with card preview data.           #
#                                                                               #
# This serializer returns data needed to render location markers on the map     #
# AND populate the bottom card preview when a marker is tapped. By including    #
# all card fields upfront, we eliminate the need for a second API call when     #
# users tap a marker.                                                           #
#                                                                               #
# Fields included:                                                              #
# - Coordinates: latitude, longitude (for marker placement)                     #
# - Card data: name, region, elevation, rating, review_count, is_favorited      #
# - Images: Up to 5 thumbnail URLs from hybrid pool (location + review photos)  #
# ----------------------------------------------------------------------------- #
class MapLocationSerializer(serializers.ModelSerializer):
    is_favorited = serializers.SerializerMethodField()
    is_visited = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    location_type_display = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            'id', 'name', 'location_type', 'location_type_display', 'type_metadata',
            'latitude', 'longitude',
            'administrative_area', 'country', 'elevation',
            'bortle_class', 'bortle_sqm',
            'average_rating', 'review_count', 'is_favorited', 'is_visited', 'images'
        ]
        read_only_fields = fields

    def get_location_type_display(self, obj):
        """Return human-readable location type name."""
        return obj.get_location_type_display()

    def get_is_favorited(self, obj):
        # Use annotation if available, otherwise query
        if hasattr(obj, 'is_favorited_annotated'):
            return obj.is_favorited_annotated
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return FavoriteLocation.objects.filter(
                user=request.user,
                location=obj
            ).exists()
        return False

    def get_is_visited(self, obj):
        # Use annotation if available, otherwise query
        if hasattr(obj, 'is_visited_annotated'):
            return obj.is_visited_annotated
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return LocationVisit.objects.filter(
                user=request.user,
                location=obj
            ).exists()
        return False

    def get_average_rating(self, obj):
        # Use annotation if available, otherwise compute
        if hasattr(obj, 'average_rating_annotated'):
            return obj.average_rating_annotated
        return obj.reviews.aggregate(avg_rating=Avg('rating'))['avg_rating']

    def get_review_count(self, obj):
        # Use annotation if available, otherwise compute
        if hasattr(obj, 'review_count_annotated'):
            return obj.review_count_annotated
        return obj.reviews.count()

    def get_images(self, obj):
        """Return up to 5 images sorted by upvotes, with user attribution and vote data."""
        request = self.context.get('request')
        return get_images_with_votes(obj, request)



# ----------------------------------------------------------------------------- #
# Optimized serializer for map info panel display.                              #
#                                                                               #
# This serializer provides just enough data to populate the info panel that     #
# appears when a user clicks a marker on the map. It includes basic location    #
# info and review statistics, but excludes heavy nested data like full review   #
# content, photos, comments, and vote data.                                     #
# ----------------------------------------------------------------------------- #
class LocationInfoPanelSerializer(serializers.ModelSerializer):

    added_by_id = serializers.IntegerField(source='added_by.id', read_only=True)
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()


    class Meta:
        model = Location
        fields = [
            'id', 'name', 'latitude', 'longitude', 'elevation',
            'formatted_address',
            'added_by_id', 'average_rating', 'review_count'
        ]
        read_only_fields = fields


    # Calculate average rating without fetching full review objects:
    def get_average_rating(self, obj):
        return obj.reviews.aggregate(avg_rating=Avg('rating'))['avg_rating']


    # Get review count without fetching full review objects:
    def get_review_count(self, obj):
        return obj.reviews.count()



# ----------------------------------------------------------------------------- #
# Optimized serializer for location list view (API endpoint).                   #
#                                                                               #
# This serializer is used for the location list API endpoint (/api/locations/)  #
# and excludes nested review data to prevent N+1 query problems. Instead of     #
# including full nested ReviewSerializer objects, it uses annotations from the  #
# ViewSet queryset to provide review_count and average_rating.                  #
#                                                                               #
# Performance Impact:                                                           #
# - WITHOUT this optimization: 548 queries for 20 locations (N+1 problem)       #
# - WITH this optimization: ~8 queries for 20 locations (96%+ reduction)        #
#                                                                               #
# Note: Full reviews are available via /api/locations/{id}/reviews/ endpoint    #
# ----------------------------------------------------------------------------- #
class LocationListSerializer(serializers.ModelSerializer):
    added_by = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()
    is_visited = serializers.SerializerMethodField()
    verified_by = serializers.SerializerMethodField()
    location_type_display = serializers.SerializerMethodField()

    # Use annotations instead of nested reviews to avoid N+1 queries:
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    # Distance in kilometers (only present when distance filter is active)
    distance = serializers.SerializerMethodField()


    class Meta:
        model = Location
        fields = ['id', 'name', 'location_type', 'location_type_display', 'type_metadata',
                  'latitude', 'longitude', 'elevation',
                  'bortle_class', 'bortle_sqm',
                  'formatted_address', 'administrative_area', 'locality', 'country',
                  'added_by',
                  'created_at', 'is_favorited', 'is_visited',
                  'average_rating', 'review_count', 'images', 'distance',

                  # Verification fields:
                  'is_verified', 'verification_date', 'verified_by',
                  'times_reported', 'last_visited', 'visitor_count'
                  ]

        read_only_fields = ['id', 'added_by',
                          'created_at', 'formatted_address', 'administrative_area',
                          'locality', 'country', 'type_metadata',
                          'bortle_class', 'bortle_sqm',

                            # Verification fields are read-only (managed by system)
                            'is_verified', 'verification_date', 'verified_by',
                            'times_reported', 'last_visited', 'visitor_count'
                            ]


    def get_added_by(self, obj):
        return {
            'id': obj.added_by.id,
            'username': obj.added_by.username
        } if obj.added_by else None


    def get_average_rating(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'average_rating_annotated'):
            return obj.average_rating_annotated
        return obj.reviews.aggregate(avg_rating=Avg('rating'))['avg_rating']


    def get_review_count(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'review_count_annotated'):
            return obj.review_count_annotated
        return obj.reviews.count()


    def get_is_favorited(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'is_favorited_annotated'):
            return obj.is_favorited_annotated

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return FavoriteLocation.objects.filter(
                user=request.user,
                location=obj
            ).exists()

        # Otherwise return false since no favorites:
        return False


    def get_is_visited(self, obj):
        # Use annotation if available (from optimized queryset), otherwise compute
        if hasattr(obj, 'is_visited_annotated'):
            return obj.is_visited_annotated

        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return LocationVisit.objects.filter(
                user=request.user,
                location=obj
            ).exists()

        return False


    def get_verified_by(self, obj):
        if obj.verified_by:
            return {
                'id': obj.verified_by.id,
                'username': obj.verified_by.username
            }
        return None

    def get_location_type_display(self, obj):
        """Return human-readable location type name."""
        return obj.get_location_type_display()

    def get_images(self, obj):
        """Return up to 5 images sorted by upvotes, with user attribution and vote data."""
        request = self.context.get('request')
        return get_images_with_votes(obj, request)

    def get_distance(self, obj):
        """Return distance in kilometers. Frontend handles unit preference."""
        if hasattr(obj, 'distance_km') and obj.distance_km is not None:
            # Handle both float (old) and Distance object (PostGIS)
            if hasattr(obj.distance_km, 'm'):
                # PostGIS Distance object - convert meters to km
                return round(obj.distance_km.m / 1000, 1)
            # Already a float in km
            return round(obj.distance_km, 1)
        return None
