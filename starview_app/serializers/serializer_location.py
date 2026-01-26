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
from rest_framework import serializers
from ..models import Location
from ..models import FavoriteLocation
from ..models import LocationVisit
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

    # Get profile picture URL
    profile_picture = settings.DEFAULT_PROFILE_PICTURE
    if hasattr(user, 'userprofile') and user.userprofile:
        profile_picture = user.userprofile.get_profile_picture_url

    return {
        'username': user.username,
        'display_name': display_name,
        'profile_picture': profile_picture,
    }



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
    images = serializers.SerializerMethodField()


    class Meta:
        model = Location
        fields = ['id', 'name', 'description', 'location_type', 'location_type_display', 'type_metadata',
                  'latitude', 'longitude', 'elevation',
                  'bortle_class', 'bortle_sqm',
                  'formatted_address', 'administrative_area', 'locality', 'country',
                  'added_by',
                  'created_at', 'is_favorited', 'is_visited',
                  'reviews', 'average_rating', 'review_count', 'images',

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

    def get_images(self, obj):
        """Return up to 5 images from hybrid pool (location + review photos), with user attribution."""
        photos = []

        # 1. Get location photos (creator uploads) - most recent first
        if hasattr(obj, 'prefetched_location_photos'):
            location_photos = obj.prefetched_location_photos
        else:
            location_photos = obj.photos.select_related('uploaded_by__userprofile').order_by('-created_at')[:5]

        for photo in location_photos:
            if len(photos) >= 5:
                break
            # Use uploaded_by if set, otherwise fall back to location.added_by
            uploader = photo.uploaded_by if photo.uploaded_by else obj.added_by
            photos.append({
                'id': f'loc_{photo.id}',
                'thumbnail': photo.thumbnail_url,
                'full': photo.image_url,
                'uploaded_by': get_user_attribution(uploader),
                'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
            })

        # 2. Add review photos to fill up to 5
        if len(photos) < 5:
            if hasattr(obj, 'prefetched_reviews'):
                reviews = obj.prefetched_reviews
            else:
                reviews = obj.reviews.select_related('user__userprofile').prefetch_related('photos').order_by('-created_at')

            for review in reviews:
                if hasattr(review, 'prefetched_photos'):
                    review_photos = review.prefetched_photos
                else:
                    review_photos = review.photos.all().order_by('order')

                for photo in review_photos:
                    if len(photos) >= 5:
                        break
                    photos.append({
                        'id': f'rev_{photo.id}',
                        'thumbnail': photo.thumbnail_url,
                        'full': photo.image_url,
                        'uploaded_by': get_user_attribution(review.user),
                        'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
                    })
                if len(photos) >= 5:
                    break

        return photos



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
        """Return up to 5 images from hybrid pool (location + review photos), with user attribution."""
        photos = []

        # 1. Get location photos (creator uploads) - most recent first
        if hasattr(obj, 'prefetched_location_photos'):
            location_photos = obj.prefetched_location_photos
        else:
            location_photos = obj.photos.select_related('uploaded_by__userprofile').order_by('-created_at')[:5]

        for photo in location_photos:
            if len(photos) >= 5:
                break
            # Use uploaded_by if set, otherwise fall back to location.added_by
            uploader = photo.uploaded_by if photo.uploaded_by else obj.added_by
            photos.append({
                'id': f'loc_{photo.id}',
                'thumbnail': photo.thumbnail_url,
                'full': photo.image_url,
                'uploaded_by': get_user_attribution(uploader),
                'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
            })

        # 2. Add review photos to fill up to 5
        if len(photos) < 5:
            if hasattr(obj, 'prefetched_reviews'):
                reviews = obj.prefetched_reviews
            else:
                reviews = obj.reviews.select_related('user__userprofile').prefetch_related('photos').order_by('-created_at')

            for review in reviews:
                if hasattr(review, 'prefetched_photos'):
                    review_photos = review.prefetched_photos
                else:
                    review_photos = review.photos.all().order_by('order')

                for photo in review_photos:
                    if len(photos) >= 5:
                        break
                    photos.append({
                        'id': f'rev_{photo.id}',
                        'thumbnail': photo.thumbnail_url,
                        'full': photo.image_url,
                        'uploaded_by': get_user_attribution(review.user),
                        'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
                    })
                if len(photos) >= 5:
                    break

        return photos



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
        """Return up to 5 images from hybrid pool (location + review photos), with user attribution."""
        photos = []

        # 1. Get location photos (creator uploads) - most recent first
        if hasattr(obj, 'prefetched_location_photos'):
            location_photos = obj.prefetched_location_photos
        else:
            location_photos = obj.photos.select_related('uploaded_by__userprofile').order_by('-created_at')[:5]

        for photo in location_photos:
            if len(photos) >= 5:
                break
            # Use uploaded_by if set, otherwise fall back to location.added_by
            uploader = photo.uploaded_by if photo.uploaded_by else obj.added_by
            photos.append({
                'id': f'loc_{photo.id}',
                'thumbnail': photo.thumbnail_url,
                'full': photo.image_url,
                'uploaded_by': get_user_attribution(uploader),
                'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
            })

        # 2. Add review photos to fill up to 5
        if len(photos) < 5:
            if hasattr(obj, 'prefetched_reviews'):
                reviews = obj.prefetched_reviews
            else:
                reviews = obj.reviews.select_related('user__userprofile').prefetch_related('photos').order_by('-created_at')

            for review in reviews:
                if hasattr(review, 'prefetched_photos'):
                    review_photos = review.prefetched_photos
                else:
                    review_photos = review.photos.all().order_by('order')

                for photo in review_photos:
                    if len(photos) >= 5:
                        break
                    photos.append({
                        'id': f'rev_{photo.id}',
                        'thumbnail': photo.thumbnail_url,
                        'full': photo.image_url,
                        'uploaded_by': get_user_attribution(review.user),
                        'uploaded_at': photo.created_at.isoformat() if photo.created_at else None,
                    })
                if len(photos) >= 5:
                    break

        return photos

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
