# ----------------------------------------------------------------------------------------------------- #
# This views_location.py file handles all location-related views and API endpoints:                     #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides REST API endpoints and template views for managing stargazing locations. Handles location    #
# creation, retrieval, updates, and enrichment with geographic data (elevation, address).               #
#                                                                                                       #
# Key Features:                                                                                         #
# - LocationViewSet: Full CRUD API for locations with filtering, search, and ordering                   #
# - Map optimization: Lightweight endpoints for 3D globe (map_geojson + info_panel, 96%+ reduction)     #
# - Report handling: Users can report problematic locations using the generic Report model              #
# - Template view: location_details displays location info with reviews (read-only)                     #
#                                                                                                       #
# Architecture:                                                                                         #
# - Uses Django REST Framework ViewSets for API endpoints                                               #
# - Delegates business logic to service layer (ReportService, VoteService)                              #
# - Errors raised as exceptions, caught by global exception handler (Phase 4)                           #
# - Template views are read-only; all write operations use API endpoints                                #
# - Favorite operations are handled by FavoriteLocationViewSet in views_favorite.py                     #
# ----------------------------------------------------------------------------------------------------- #

# Django imports:
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db.models import Avg, Count, Q, Exists, OuterRef, F, FloatField
from django.contrib.gis.geos import Point
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D

# REST Framework imports:
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly

# Model imports:
from ..models import Location
from ..models import Review
from ..models import FavoriteLocation
from ..models import ReviewPhoto
from ..models import LocationPhoto
from django.db.models import Prefetch

# Serializer imports:
from ..serializers import LocationSerializer
from ..serializers import LocationInfoPanelSerializer

# Service imports:
from ..services import ReportService
from ..services import VoteService

# Throttle imports:
from starview_app.utils import ContentCreationThrottle, ReportThrottle, VoteThrottle

# Cache imports:
from starview_app.utils import (
    location_list_key,
    location_detail_key,
    map_geojson_key,
    invalidate_location_list,
    invalidate_location_detail,
    invalidate_map_geojson,
    invalidate_user_map_geojson,
    invalidate_all_location_caches,
)
from django.core.cache import cache

# Web Mercator projection limit - locations beyond ±85° don't render on globe view
MAX_RENDERABLE_LATITUDE = 85.0



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       LOCATION VIEWSET                                                #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# API ViewSet for managing stargazing locations.                                #
#                                                                               #
# Provides endpoints for creating, retrieving, updating, and deleting           #
# locations. Includes actions for reporting and optimized endpoints for map     #
# display (map_geojson, info_panel).                                            #
# ----------------------------------------------------------------------------- #
class LocationViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticatedOrReadOnly]


    # Use different serializers for list vs detail views:
    def get_serializer_class(self):
        # For list view, don't include nested reviews (too much data)
        # Reviews are available via the nested endpoint /api/locations/{id}/reviews/
        if self.action == 'list':
            from ..serializers import LocationListSerializer
            return LocationListSerializer

        # SCALABILITY NOTE:
        # Currently 'retrieve' (detail) view returns LocationSerializer with ALL nested reviews.
        # This works fine for locations with 1-20 reviews, but can be slow with 100+ reviews.
        #
        # For better scalability, change this to:
        #   return LocationListSerializer
        #
        # Then have frontend fetch reviews separately via:
        #   GET /api/locations/{id}/reviews/?page=1 (already paginated, 20 per page)
        return LocationSerializer


    # Optimize queryset with select_related, prefetch_related, and annotations:
    def get_queryset(self):
        # Get sort parameter (default: newest first)
        sort = self.request.query_params.get('sort', '-created_at')

        # Check if distance sorting requested (only valid when distance filter active)
        near = self.request.query_params.get('near')
        has_distance_filter = near and near != 'me'

        # Validate sort parameter to prevent injection
        # Note: distance sorting is handled in list() after _apply_filters adds the annotation
        valid_sorts = {
            '-created_at': ['-created_at', 'id'],
            'created_at': ['created_at', 'id'],
            '-average_rating': ['-average_rating_annotated', '-review_count_annotated', 'id'],
            'average_rating': ['average_rating_annotated', '-review_count_annotated', 'id'],
            '-review_count': ['-review_count_annotated', 'id'],
            'review_count': ['review_count_annotated', 'id'],
        }

        # Distance sorting needs distance_km annotation from _apply_filters
        # Use default order here; list() will re-order after annotation is added
        if sort in ('distance', '-distance') and has_distance_filter:
            order_by = ['-created_at', 'id']  # Temporary default, will be re-ordered
        else:
            order_by = valid_sorts.get(sort, ['-created_at', 'id'])

        queryset = Location.objects.select_related(
            'added_by',
            'verified_by'
        ).annotate(
            review_count_annotated=Count('reviews'),
            average_rating_annotated=Avg('reviews__rating')
        ).order_by(*order_by)

        # For detail view, prefetch nested reviews with votes to avoid N+1
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related(
                'reviews__user',
                'reviews__photos',
                'reviews__votes',  # Prefetch votes for reviews
                'reviews__comments__user',
                'reviews__comments__votes'  # Prefetch votes for comments
            )
        elif self.action == 'list':
            # For list view, prefetch photos for image carousel
            queryset = queryset.prefetch_related(
                Prefetch(
                    'photos',
                    queryset=LocationPhoto.objects.order_by('-created_at'),
                    to_attr='prefetched_location_photos'
                ),
                Prefetch(
                    'reviews',
                    queryset=Review.objects.order_by('-created_at').prefetch_related(
                        Prefetch(
                            'photos',
                            queryset=ReviewPhoto.objects.order_by('order'),
                            to_attr='prefetched_photos'
                        )
                    ),
                    to_attr='prefetched_reviews'
                )
            )

        # Add is_favorited annotation for authenticated users
        if self.request.user.is_authenticated:
            queryset = queryset.annotate(
                is_favorited_annotated=Exists(
                    FavoriteLocation.objects.filter(
                        user=self.request.user,
                        location=OuterRef('pk')
                    )
                )
            )

        return queryset


    # ----------------------------------------------------------------------------- #
    # Apply search/filter parameters. Used by list() and map_geojson().             #
    # ----------------------------------------------------------------------------- #
    def _apply_filters(self, queryset):
        """Apply search/filter parameters from query params."""
        params = self.request.query_params

        # Text search (name, address, region, country)
        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(formatted_address__icontains=search) |
                Q(administrative_area__icontains=search) |
                Q(country__icontains=search)
            )

        # Location type (multi-select, comma-separated)
        types = params.get('type')
        if types:
            valid_types = [t[0] for t in Location.LOCATION_TYPES]
            types_list = [t for t in types.split(',') if t in valid_types]
            if types_list:
                queryset = queryset.filter(location_type__in=types_list)

        # Minimum rating
        min_rating = params.get('minRating')
        if min_rating:
            try:
                queryset = queryset.filter(average_rating_annotated__gte=float(min_rating))
            except ValueError:
                pass

        # Verified only
        if params.get('verified') == 'true':
            queryset = queryset.filter(is_verified=True)

        # Bortle filter (lower is better, so maxBortle means "at most this polluted")
        max_bortle = params.get('maxBortle')
        if max_bortle:
            try:
                queryset = queryset.filter(bortle_class__lte=int(max_bortle))
            except (ValueError, TypeError):
                pass

        # Distance filter (Haversine) - 'near' param contains "lat,lng" or "me"
        near = params.get('near')
        radius = params.get('radius')
        if near and near != 'me':
            queryset = self._filter_by_distance(queryset, near, radius)

        return queryset


    # ----------------------------------------------------------------------------- #
    # Filter queryset by distance using PostGIS ST_DWithin.                         #
    # Uses GiST spatial index for efficient filtering.                              #
    # ----------------------------------------------------------------------------- #
    def _filter_by_distance(self, queryset, near, radius):
        """Filter by distance using PostGIS ST_DWithin."""
        try:
            lat, lng = [float(x) for x in near.split(',')]

            # Validate coordinate ranges (lat: -90 to 90, lng: -180 to 180)
            if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                return queryset

            radius_miles = float(radius or 50)
            # Validate radius is positive and reasonable (max 12500 miles ~ Earth circumference / 2)
            if radius_miles <= 0 or radius_miles > 12500:
                radius_miles = 50  # Default to 50 miles if invalid
            radius_km = radius_miles * 1.60934  # miles to km
        except (ValueError, TypeError):
            return queryset

        # Create Point for user's location (PostGIS uses lng, lat order)
        user_location = Point(lng, lat, srid=4326)

        # Filter using PostGIS ST_DWithin (uses GiST spatial index)
        # D(km=...) specifies distance in kilometers for geography fields
        queryset = queryset.filter(
            coordinates__dwithin=(user_location, D(km=radius_km))
        ).annotate(
            # Distance returns a Distance object, we convert to km in serializer
            distance_km=Distance('coordinates', user_location)
        )

        return queryset


    # ----------------------------------------------------------------------------- #
    # List all locations with pagination and caching.                               #
    #                                                                               #
    # Cache Strategy:                                                               #
    # - Cache each page separately for 15 minutes (900 seconds)                     #
    # - Authenticated users get different cache (includes is_favorited)             #
    # - Invalidated when: new location created, location deleted                    #
    #                                                                               #
    # Performance Impact:                                                           #
    # - Before caching: 4 queries per request (already optimized with annotations)  #
    # - After caching: 0 queries for cache hits (~90%+ of requests)                 #
    # ----------------------------------------------------------------------------- #
    def list(self, request, *args, **kwargs):
        page = request.GET.get('page', 1)
        sort = request.GET.get('sort', '-created_at')

        # Check if filters are active (skip caching for filtered results)
        filter_params = ['search', 'type', 'minRating', 'verified', 'near', 'radius', 'maxBortle']
        has_filters = any(request.GET.get(p) for p in filter_params)

        # Only cache unfiltered requests (filtered results vary too much)
        cache_key = None
        if not has_filters:
            if request.user.is_authenticated:
                cache_key = f'{location_list_key(page)}:sort:{sort}:user:{request.user.id}'
            else:
                cache_key = f'{location_list_key(page)}:sort:{sort}'

            # Try to get from cache
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)

        # Cache miss or filtered request - get data from database
        queryset = self.filter_queryset(self.get_queryset())

        # Apply search/filter parameters
        queryset = self._apply_filters(queryset)

        # Re-apply distance sort after _apply_filters adds distance_km annotation
        if sort in ('distance', '-distance') and has_filters:
            order_by = ['distance_km', 'id'] if sort == 'distance' else ['-distance_km', 'id']
            queryset = queryset.order_by(*order_by)

        # Paginate the queryset
        page_obj = self.paginate_queryset(queryset)
        if page_obj is not None:
            serializer = self.get_serializer(page_obj, many=True)
            response_data = self.get_paginated_response(serializer.data).data
        else:
            serializer = self.get_serializer(queryset, many=True)
            response_data = serializer.data

        # Cache unfiltered results for 15 minutes
        if cache_key:
            cache.set(cache_key, response_data, timeout=900)

        return Response(response_data)


    # ----------------------------------------------------------------------------- #
    # Retrieve a single location with caching.                                      #
    #                                                                               #
    # Cache Strategy:                                                               #
    # - Cache each location separately for 15 minutes (900 seconds)                 #
    # - Authenticated users get different cache (includes is_favorited, nested      #
    # reviews with user_vote)                                                       #
    # - Invalidated when: location updated, review added/updated/deleted            #
    #                                                                               #
    # Performance Impact:                                                           #
    # - Before caching: 9 queries per request (with prefetching)                    #
    # - After caching: 0 queries for cache hits (~80%+ of requests)                 #
    # ----------------------------------------------------------------------------- #
    def retrieve(self, request, *args, **kwargs):
        location_id = kwargs.get('pk')

        # Different cache keys for authenticated vs anonymous users
        if request.user.is_authenticated:
            cache_key = f'{location_detail_key(location_id)}:user:{request.user.id}'
        else:
            cache_key = location_detail_key(location_id)

        # Try to get from cache
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        # Cache miss - get data from database
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        response_data = serializer.data

        # Cache for 15 minutes
        cache.set(cache_key, response_data, timeout=900)

        return Response(response_data)


    # Apply different throttles based on action:
    def get_throttles(self):
        if self.action == 'create':
            # Limit location creation to prevent spam
            return [ContentCreationThrottle()]
        elif self.action == 'report':
            # Limit reports to prevent report abuse
            return [ReportThrottle()]
        return super().get_throttles()


    # ----------------------------------------------------------------------------- #
    # Create a new location and set the user who added it.                          #
    #                                                                               #
    # DRF Note: This overrides ModelViewSet's default perform_create() to inject    #
    # the current user as added_by. Without this override, DRF would just call      #
    # serializer.save() with no additional context. We also invalidate caches       #
    # since the location list and map markers now have new data.                    #
    # ----------------------------------------------------------------------------- #
    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)

        # Invalidate caches since new location was created
        invalidate_location_list()  # Clear all location list pages
        invalidate_map_geojson()  # Clear map GeoJSON cache


    # ----------------------------------------------------------------------------- #
    # Update a location and invalidate related caches.                              #
    #                                                                               #
    # DRF Note: This overrides ModelViewSet's default perform_update() to add       #
    # cache invalidation. Without this override, DRF would just call                #
    # serializer.save() with no cache clearing, causing stale data to be served.    #
    # ----------------------------------------------------------------------------- #
    def perform_update(self, serializer):
        location = self.get_object()
        serializer.save()

        # Invalidate caches since location was updated
        invalidate_all_location_caches(location.id)  # Clear all related caches


    # ----------------------------------------------------------------------------- #
    # Delete a location and invalidate related caches.                              #
    #                                                                               #
    # DRF Note: This overrides ModelViewSet's default perform_destroy() to add      #
    # cache invalidation. Without this override, DRF would just call                #
    # instance.delete() with no cache clearing, causing deleted locations to        #
    # still appear in cached responses.                                             #
    # ----------------------------------------------------------------------------- #
    def perform_destroy(self, instance):
        location_id = instance.id
        instance.delete()

        # Invalidate caches since location was deleted
        invalidate_location_list()  # Clear location list
        invalidate_map_geojson()  # Clear map GeoJSON cache
        invalidate_location_detail(location_id)  # Clear this location's detail


    # Submit a report about this location using the ReportService:
    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated])
    def report(self, request, pk=None):
        location = self.get_object()

        # Use ReportService to handle report submission
        # ReportService raises ValidationError on failure (caught by exception handler)
        report = ReportService.submit_report(
            user=request.user,
            content_object=location,
            report_type=request.data.get('report_type', 'OTHER'),
            description=request.data.get('description', '')
        )

        # Increment report counter on the location
        location.times_reported += 1
        location.save()

        # Return success response
        content_type_name = report.content_type.model.replace('_', ' ').capitalize()
        return Response(
            {'detail': f'{content_type_name} reported successfully'},
            status=status.HTTP_201_CREATED
        )


    # ----------------------------------------------------------------------------- #
    # Toggle favorite status for a location.                                        #
    #                                                                               #
    # Creates a favorite if it doesn't exist, removes it if it does.                #
    # Returns the new favorite status so frontend can update UI.                    #
    # Invalidates user's cached location list so is_favorited updates on refresh.   #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated])
    def toggle_favorite(self, request, pk=None):
        location = self.get_object()

        # Try to get existing favorite
        favorite = FavoriteLocation.objects.filter(
            user=request.user,
            location=location
        ).first()

        if favorite:
            # Already favorited - remove it
            favorite.delete()
            is_favorited = False
        else:
            # Not favorited - create it
            FavoriteLocation.objects.create(
                user=request.user,
                location=location
            )
            is_favorited = True

        # Invalidate user's cached location lists (all pages)
        for page in range(1, 100):  # Clear first 100 pages
            cache_key = f'{location_list_key(page)}:user:{request.user.id}'
            cache.delete(cache_key)

        # Also invalidate the detail cache for this location
        detail_cache_key = f'{location_detail_key(location.id)}:user:{request.user.id}'
        cache.delete(detail_cache_key)

        # Invalidate user's map GeoJSON cache so favorites show correctly on refresh
        invalidate_user_map_geojson(request.user.id)

        return Response(
            {'is_favorited': is_favorited},
            status=status.HTTP_201_CREATED if is_favorited else status.HTTP_200_OK
        )


    # ----------------------------------------------------------------------------- #
    # Get map locations as GeoJSON FeatureCollection.                               #
    #                                                                               #
    # Returns a GeoJSON FeatureCollection pre-generated on the backend to reduce    #
    # client-side CPU usage. The GeoJSON is ready to be directly passed to Mapbox.  #
    #                                                                               #
    # Cache Strategy:                                                               #
    # - Cached for 30 minutes (1800 seconds) - same as map_markers                  #
    # - Authenticated users get different cache (includes is_favorited)             #
    # - Invalidated when: location created, location deleted, coordinates change    #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['GET'])
    def map_geojson(self, request):

        # Parse optional bbox parameter (west,south,east,north)
        # When bbox is provided, skip caching since viewports are highly variable
        bbox_param = request.query_params.get('bbox')
        bbox = None
        if bbox_param:
            try:
                parts = [float(x) for x in bbox_param.split(',')]
                if len(parts) == 4:
                    west, south, east, north = parts
                    # Validate bounds (including south < north constraint)
                    if -180 <= west <= 180 and -180 <= east <= 180 and \
                       -90 <= south <= 90 and -90 <= north <= 90 and south < north:
                        bbox = {'west': west, 'south': south, 'east': east, 'north': north}
            except (ValueError, TypeError):
                pass  # Invalid bbox format, ignore and return all locations

        # Check if filters are active (skip caching for filtered results)
        filter_params = ['search', 'type', 'minRating', 'verified', 'near', 'radius', 'maxBortle']
        has_filters = any(request.query_params.get(p) for p in filter_params)

        # Only use cache when no bbox or filters (full dataset)
        cache_key = None
        if not bbox and not has_filters:
            base_cache_key = map_geojson_key()
            if request.user.is_authenticated:
                cache_key = f'{base_cache_key}:user:{request.user.id}'
            else:
                cache_key = base_cache_key

            # Try to get from cache
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)

        # Cache miss, bbox, or filtered query - get data from database with annotations
        # Filter out extreme latitudes that don't render on Mapbox globe projection
        queryset = Location.objects.filter(
            latitude__gte=-MAX_RENDERABLE_LATITUDE,
            latitude__lte=MAX_RENDERABLE_LATITUDE
        )

        # Apply bbox filter if provided (uses location_coords_idx index)
        if bbox:
            # Handle antimeridian crossing (west > east means crossing 180°)
            if bbox['west'] > bbox['east']:
                # Split into two ranges: west to 180 and -180 to east
                queryset = queryset.filter(
                    Q(longitude__gte=bbox['west'], longitude__lte=180) |
                    Q(longitude__gte=-180, longitude__lte=bbox['east'])
                )
            else:
                queryset = queryset.filter(
                    longitude__gte=bbox['west'],
                    longitude__lte=bbox['east']
                )
            queryset = queryset.filter(
                latitude__gte=bbox['south'],
                latitude__lte=bbox['north']
            )

        queryset = queryset.annotate(
            review_count_annotated=Count('reviews'),
            average_rating_annotated=Avg('reviews__rating')
        ).prefetch_related(
            # Prefetch photos for image carousel
            Prefetch(
                'photos',
                queryset=LocationPhoto.objects.order_by('-created_at'),
                to_attr='prefetched_location_photos'
            ),
            Prefetch(
                'reviews',
                queryset=Review.objects.order_by('-created_at').prefetch_related(
                    Prefetch(
                        'photos',
                        queryset=ReviewPhoto.objects.order_by('order'),
                        to_attr='prefetched_photos'
                    )
                ),
                to_attr='prefetched_reviews'
            )
        )

        # Add is_favorited annotation for authenticated users
        if request.user.is_authenticated:
            queryset = queryset.annotate(
                is_favorited_annotated=Exists(
                    FavoriteLocation.objects.filter(
                        user=request.user,
                        location=OuterRef('pk')
                    )
                )
            )

        # Apply search/filter parameters (after annotations so minRating filter works)
        queryset = self._apply_filters(queryset)

        # Build GeoJSON FeatureCollection
        features = []
        for loc in queryset:
            # Collect images from location photos and review photos
            images = []
            # Add location photos first
            for photo in getattr(loc, 'prefetched_location_photos', [])[:5]:
                images.append({
                    'id': str(photo.id),
                    'thumbnail': photo.image.url if photo.image else None,
                    'full': photo.image.url if photo.image else None,
                })
            # Add review photos if we need more
            if len(images) < 5:
                for review in getattr(loc, 'prefetched_reviews', []):
                    for photo in getattr(review, 'prefetched_photos', []):
                        if len(images) >= 5:
                            break
                        images.append({
                            'id': str(photo.id),
                            'thumbnail': photo.image.url if photo.image else None,
                            'full': photo.image.url if photo.image else None,
                        })
                    if len(images) >= 5:
                        break

            avg_rating = float(loc.average_rating_annotated) if loc.average_rating_annotated else None
            features.append({
                'type': 'Feature',
                'properties': {
                    'id': loc.id,
                    'name': loc.name,
                    'is_favorited': getattr(loc, 'is_favorited_annotated', False),
                    'location_type': loc.location_type,
                    'location_type_display': loc.get_location_type_display(),
                    'type_metadata': loc.type_metadata or {},
                    'administrative_area': loc.administrative_area or '',
                    'country': loc.country or '',
                    'elevation': loc.elevation,
                    'bortle_class': loc.bortle_class,
                    'bortle_sqm': float(loc.bortle_sqm) if loc.bortle_sqm else None,
                    'latitude': float(loc.latitude),
                    'longitude': float(loc.longitude),
                    'average_rating': avg_rating,  # For bottom card
                    'avg_rating': avg_rating,  # For map popup (legacy name)
                    'review_count': loc.review_count_annotated or 0,
                    'images': images,
                },
                'geometry': {
                    'type': 'Point',
                    'coordinates': [float(loc.longitude), float(loc.latitude)]
                }
            })

        geojson = {
            'type': 'FeatureCollection',
            'features': features
        }

        # Only cache full dataset (no bbox filter)
        if cache_key:
            cache.set(cache_key, geojson, timeout=1800)

        return Response(geojson)


    # ----------------------------------------------------------------------------- #
    # Get optimized location data for map info panel display.                       #
    #                                                                               #
    # Returns just enough data to populate the info panel that appears when         #
    # a user clicks a marker on the map. Excludes heavy nested data like full       #
    # review content, photos, comments, and vote data.                              #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['GET'], serializer_class=LocationInfoPanelSerializer)
    def info_panel(self, request, pk=None):

        location = self.get_object()
        serializer = self.get_serializer(location)
        return Response(serializer.data)


    # ----------------------------------------------------------------------------- #
    # Mark a location as visited (check-in).                                        #
    #                                                                               #
    # Creates a LocationVisit record for the user.                                  #
    # Triggers exploration badge checking via signal.                               #
    #                                                                               #
    # HTTP Method: POST                                                             #
    # Endpoint: /api/locations/{id}/mark-visited/                                   #
    # Authentication: Required                                                      #
    # Returns: Success message, total visits, and newly earned badges               #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated], url_path='mark-visited')
    def mark_visited(self, request, pk=None):
        from starview_app.models import LocationVisit, UserBadge
        from django.utils import timezone
        from datetime import timedelta

        location = self.get_object()

        # Check if already visited
        visit, created = LocationVisit.objects.get_or_create(
            user=request.user,
            location=location
        )

        if not created:
            return Response({
                'detail': 'You have already marked this location as visited.',
                'total_visits': LocationVisit.objects.filter(user=request.user).count(),
                'newly_earned_badges': []
            }, status=status.HTTP_200_OK)

        # Get newly earned badges (check last 2 seconds)
        newly_earned = UserBadge.objects.filter(
            user=request.user,
            earned_at__gte=timezone.now() - timedelta(seconds=2)
        ).select_related('badge')

        newly_earned_data = [{
            'badge_id': ub.badge.id,
            'name': ub.badge.name,
            'slug': ub.badge.slug,
            'description': ub.badge.description,
            'icon_path': ub.badge.icon_path
        } for ub in newly_earned]

        return Response({
            'detail': f'Location "{location.name}" marked as visited.',
            'total_visits': LocationVisit.objects.filter(user=request.user).count(),
            'newly_earned_badges': newly_earned_data
        }, status=status.HTTP_201_CREATED)


    # ----------------------------------------------------------------------------- #
    # Unmark a location as visited (remove check-in).                               #
    #                                                                               #
    # Deletes the LocationVisit record for the user.                                #
    # Note: May trigger badge revocation if implemented in Phase 2.                 #
    #                                                                               #
    # HTTP Method: DELETE                                                           #
    # Endpoint: /api/locations/{id}/unmark-visited/                                 #
    # Authentication: Required                                                      #
    # Returns: Success message and updated total visits                             #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['DELETE'], permission_classes=[IsAuthenticated], url_path='unmark-visited')
    def unmark_visited(self, request, pk=None):
        from starview_app.models import LocationVisit

        location = self.get_object()

        try:
            visit = LocationVisit.objects.get(
                user=request.user,
                location=location
            )
            visit.delete()

            return Response({
                'detail': f'Location "{location.name}" unmarked as visited.',
                'total_visits': LocationVisit.objects.filter(user=request.user).count()
            }, status=status.HTTP_200_OK)

        except LocationVisit.DoesNotExist:
            return Response({
                'detail': 'You have not marked this location as visited.',
                'total_visits': LocationVisit.objects.filter(user=request.user).count()
            }, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # Toggle Visited - Mark or unmark a location as visited.                        #
    #                                                                               #
    # Creates a LocationVisit record if it doesn't exist, removes it if it does.    #
    # Returns the new visited status so frontend can update UI optimistically.      #
    # Triggers exploration badge checking via signal when marking visited.          #
    #                                                                               #
    # HTTP Method: POST                                                             #
    # Endpoint: /api/locations/{id}/toggle-visited/                                 #
    # Authentication: Required                                                      #
    # Returns: { is_visited: boolean, newly_earned_badges: Array }                  #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated], url_path='toggle-visited')
    def toggle_visited(self, request, pk=None):
        from starview_app.models import LocationVisit, UserBadge
        from django.utils import timezone

        location = self.get_object()

        # Try to get existing visit
        visit = LocationVisit.objects.filter(
            user=request.user,
            location=location
        ).first()

        newly_earned_badges = []

        if visit:
            # Already visited - remove it
            visit.delete()
            is_visited = False
        else:
            # Not visited - create it
            # Get user's badges before creating visit (to detect new ones)
            badges_before = set(UserBadge.objects.filter(user=request.user).values_list('badge_id', flat=True))

            LocationVisit.objects.create(
                user=request.user,
                location=location
            )
            is_visited = True

            # Check for newly earned badges (signal handler awards them)
            badges_after = set(UserBadge.objects.filter(user=request.user).values_list('badge_id', flat=True))
            new_badge_ids = badges_after - badges_before

            if new_badge_ids:
                from starview_app.models import Badge
                newly_earned_badges = list(Badge.objects.filter(id__in=new_badge_ids).values('id', 'name', 'icon_path'))

        return Response({
            'is_visited': is_visited,
            'newly_earned_badges': newly_earned_badges,
        })


    # ----------------------------------------------------------------------------- #
    # Hero Carousel - Random high-quality location images for homepage.             #
    #                                                                               #
    # Returns 5 random locations with high-quality images (min 1200px wide).        #
    # Uses the current date as a seed so all users see the same images each day.   #
    # Results are cached until midnight UTC.                                        #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/locations/hero-carousel/                                       #
    # Authentication: None required                                                 #
    # Returns: List of 5 locations with id, name, and image URLs                    #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['GET'])
    def hero_carousel(self, request):
        import random
        from datetime import date, datetime, timezone as dt_timezone

        MIN_WIDTH = 1200  # Minimum image width for hero carousel

        cache_key = f'hero_carousel_{date.today().isoformat()}'
        cached_data = cache.get(cache_key)

        if cached_data:
            return Response(cached_data)

        # Get high-quality location photos (min width for full-screen display)
        high_quality_photos = LocationPhoto.objects.filter(
            width__gte=MIN_WIDTH
        ).select_related('location').order_by('?')

        # Build list of unique locations with their best photo
        seen_locations = set()
        candidates = []

        for photo in high_quality_photos:
            if photo.location_id not in seen_locations:
                seen_locations.add(photo.location_id)
                candidates.append({
                    'id': photo.location.id,
                    'name': photo.location.name,
                    'image_url': photo.image_url,
                })
                if len(candidates) >= 20:  # Get enough candidates for random selection
                    break

        if not candidates:
            return Response([])

        # Use date as seed so all users see same images each day
        random.seed(date.today().toordinal())
        selected = random.sample(candidates, min(5, len(candidates)))
        random.seed()  # Reset seed

        # Cache until midnight UTC
        now = datetime.now(dt_timezone.utc)
        midnight = datetime(now.year, now.month, now.day, tzinfo=dt_timezone.utc)
        midnight = midnight.replace(day=now.day + 1)
        seconds_until_midnight = int((midnight - now).total_seconds())
        cache.set(cache_key, selected, timeout=seconds_until_midnight)

        return Response(selected)


    # ----------------------------------------------------------------------------- #
    # Popular Nearby - Top-rated locations near user's coordinates.                 #
    #                                                                               #
    # Returns locations sorted with reviewed locations first (by rating desc),      #
    # then unreviewed locations (by distance). Used for "Popular Stargazing Spots"  #
    # carousel on the home page.                                                    #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/locations/popular_nearby/?lat=39.7&lng=-104.9                  #
    # Parameters:                                                                   #
    #   - lat (required): User latitude                                             #
    #   - lng (required): User longitude                                            #
    #   - limit (optional, default 8): Max results                                  #
    #   - radius (optional, default 100): Search radius in miles                    #
    # Authentication: None required                                                 #
    # Caching: 30 minutes, key rounded to 1 decimal for efficiency                  #
    # ----------------------------------------------------------------------------- #
    @action(detail=False, methods=['GET'])
    def popular_nearby(self, request):
        # Parse required parameters
        lat = request.query_params.get('lat')
        lng = request.query_params.get('lng')

        if not lat or not lng:
            return Response(
                {'detail': 'lat and lng parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lat = float(lat)
            lng = float(lng)
        except ValueError:
            return Response(
                {'detail': 'lat and lng must be valid numbers'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse optional parameters
        limit = int(request.query_params.get('limit', 8))
        radius = int(request.query_params.get('radius', 500))  # Default 500 miles for better coverage

        # Clamp values to reasonable ranges
        limit = max(1, min(limit, 20))
        radius = max(10, min(radius, 1000))

        # Round coordinates to 1 decimal for cache efficiency (~11km precision)
        cache_lat = round(lat, 1)
        cache_lng = round(lng, 1)

        # Build cache key (include user id for favorites)
        if request.user.is_authenticated:
            cache_key = f'popular_nearby:{cache_lat}:{cache_lng}:{limit}:{radius}:user:{request.user.id}'
        else:
            cache_key = f'popular_nearby:{cache_lat}:{cache_lng}:{limit}:{radius}'

        # Check cache
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        # Create Point for user's location (PostGIS uses lng, lat order)
        user_location = Point(lng, lat, srid=4326)

        # Build queryset with distance filter, sorted by distance (closest first)
        queryset = Location.objects.filter(
            coordinates__distance_lte=(user_location, D(mi=radius))
        ).select_related(
            'added_by',
            'verified_by'
        ).annotate(
            distance_km=Distance('coordinates', user_location),
            review_count_annotated=Count('reviews'),
            average_rating_annotated=Avg('reviews__rating'),
        ).prefetch_related(
            Prefetch(
                'photos',
                queryset=LocationPhoto.objects.order_by('-created_at'),
                to_attr='prefetched_location_photos'
            ),
            Prefetch(
                'reviews',
                queryset=Review.objects.order_by('-created_at').prefetch_related(
                    Prefetch(
                        'photos',
                        queryset=ReviewPhoto.objects.order_by('order'),
                        to_attr='prefetched_photos'
                    )
                ),
                to_attr='prefetched_reviews'
            )
        ).order_by('distance_km')[:limit]

        # Add is_favorited annotation for authenticated users
        if request.user.is_authenticated:
            queryset = Location.objects.filter(
                pk__in=[loc.pk for loc in queryset]
            ).select_related(
                'added_by',
                'verified_by'
            ).annotate(
                distance_km=Distance('coordinates', user_location),
                review_count_annotated=Count('reviews'),
                average_rating_annotated=Avg('reviews__rating'),
                is_favorited_annotated=Exists(
                    FavoriteLocation.objects.filter(
                        user=request.user,
                        location=OuterRef('pk')
                    )
                )
            ).prefetch_related(
                Prefetch(
                    'photos',
                    queryset=LocationPhoto.objects.order_by('-created_at'),
                    to_attr='prefetched_location_photos'
                ),
                Prefetch(
                    'reviews',
                    queryset=Review.objects.order_by('-created_at').prefetch_related(
                        Prefetch(
                            'photos',
                            queryset=ReviewPhoto.objects.order_by('order'),
                            to_attr='prefetched_photos'
                        )
                    ),
                    to_attr='prefetched_reviews'
                )
            ).order_by('distance_km')[:limit]

        # Serialize using LocationListSerializer
        from ..serializers import LocationListSerializer
        serializer = LocationListSerializer(queryset, many=True, context={'request': request})
        response_data = serializer.data

        # Cache for 30 minutes
        cache.set(cache_key, response_data, timeout=1800)

        return Response(response_data)


    # ----------------------------------------------------------------------------- #
    # Vote on a photo (LocationPhoto or ReviewPhoto).                               #
    #                                                                               #
    # Toggles upvote on a photo. Users can only upvote (no downvotes).              #
    # Same vote removes it (toggle behavior).                                       #
    # Users cannot vote on their own photos.                                        #
    #                                                                               #
    # HTTP Method: POST                                                             #
    # Endpoint: /api/locations/{id}/photos/{photo_id}/vote/                         #
    # Photo ID format: loc_123 (LocationPhoto) or rev_456 (ReviewPhoto)             #
    # Authentication: Required                                                      #
    # Returns: { upvote_count, user_has_upvoted, photo_id }                         #
    # ----------------------------------------------------------------------------- #
    @action(
        detail=True,
        methods=['POST'],
        permission_classes=[IsAuthenticated],
        url_path='photos/(?P<photo_id>[a-z]+_[0-9]+)/vote',
        throttle_classes=[VoteThrottle]
    )
    def vote_photo(self, request, pk=None, photo_id=None):
        from starview_app.services.photo_vote_service import PhotoVoteService

        # Parse photo_id (format: loc_123 or rev_456)
        if not photo_id or '_' not in photo_id:
            return Response(
                {'detail': 'Invalid photo_id format. Expected loc_123 or rev_456'},
                status=status.HTTP_400_BAD_REQUEST
            )

        prefix, id_str = photo_id.split('_', 1)

        try:
            photo_pk = int(id_str)
        except ValueError:
            return Response(
                {'detail': 'Invalid photo_id format. ID must be numeric'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get the photo object
        location = self.get_object()  # Ensures location exists

        if prefix == 'loc':
            photo = get_object_or_404(LocationPhoto, pk=photo_pk, location=location)
        elif prefix == 'rev':
            photo = get_object_or_404(ReviewPhoto, pk=photo_pk, review__location=location)
        else:
            return Response(
                {'detail': 'Invalid photo type. Expected loc_ or rev_'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Toggle the vote
        result = PhotoVoteService.toggle_upvote(request.user, photo)

        return Response(result, status=status.HTTP_200_OK)


    # ----------------------------------------------------------------------------- #
    # List photos for a location with cursor-based pagination.                      #
    #                                                                               #
    # Combines photos from LocationPhoto and ReviewPhoto into a single stream.      #
    # Supports sorting by newest, oldest, or most_upvoted.                          #
    #                                                                               #
    # HTTP Method: GET                                                              #
    # Endpoint: /api/locations/{id}/photos/                                         #
    # Query params:                                                                 #
    #   - sort: "newest" (default), "oldest", "most_upvoted"                        #
    #   - cursor: pagination cursor (optional)                                      #
    #   - limit: page size (default 24, max 50)                                     #
    # Authentication: None required                                                 #
    # Returns: { results, next_cursor, has_more, total_count }                      #
    # ----------------------------------------------------------------------------- #
    @action(detail=True, methods=['GET'], url_path='photos')
    def list_photos(self, request, pk=None):
        from django.db.models import Count, Q
        from datetime import datetime
        from starview_app.utils.pagination import decode_cursor, encode_cursor

        from django.contrib.contenttypes.models import ContentType
        from ..models import Vote

        location = self.get_object()
        user = request.user if request.user.is_authenticated else None

        # Get user's votes for efficient lookup using generic Vote model
        user_location_votes = set()
        user_review_votes = set()
        if user:
            location_photo_ct = ContentType.objects.get_for_model(LocationPhoto)
            review_photo_ct = ContentType.objects.get_for_model(ReviewPhoto)

            # Get all location photo IDs for this location
            location_photo_ids = list(
                LocationPhoto.objects.filter(location=location).values_list('id', flat=True)
            )
            # Get all review photo IDs for this location
            review_photo_ids = list(
                ReviewPhoto.objects.filter(review__location=location).values_list('id', flat=True)
            )

            # Query votes for location photos
            user_location_votes = set(
                Vote.objects.filter(
                    user=user,
                    content_type=location_photo_ct,
                    object_id__in=location_photo_ids,
                    is_upvote=True
                ).values_list('object_id', flat=True)
            )
            # Query votes for review photos
            user_review_votes = set(
                Vote.objects.filter(
                    user=user,
                    content_type=review_photo_ct,
                    object_id__in=review_photo_ids,
                    is_upvote=True
                ).values_list('object_id', flat=True)
            )

        # Parse query parameters
        sort = request.query_params.get('sort', 'newest')
        cursor_param = request.query_params.get('cursor')
        try:
            limit = min(int(request.query_params.get('limit', 24)), 50)
        except (ValueError, TypeError):
            limit = 24

        # Decode cursor if provided
        cursor = decode_cursor(cursor_param) if cursor_param else None

        # Validate sort parameter
        valid_sorts = ['newest', 'oldest', 'most_upvoted']
        if sort not in valid_sorts:
            sort = 'newest'

        # Query LocationPhoto with upvote counts
        location_photos_qs = LocationPhoto.objects.filter(
            location=location
        ).annotate(
            upvote_count_annotated=Count('votes', filter=Q(votes__is_upvote=True))
        ).select_related('uploaded_by', 'uploaded_by__userprofile')

        # Query ReviewPhoto with upvote counts
        review_photos_qs = ReviewPhoto.objects.filter(
            review__location=location
        ).annotate(
            upvote_count_annotated=Count('votes', filter=Q(votes__is_upvote=True))
        ).select_related('review__user', 'review__user__userprofile')

        # Get total count (both types combined)
        total_count = location_photos_qs.count() + review_photos_qs.count()

        # Apply cursor filter based on sort
        if cursor:
            if sort == 'newest':
                # Filter: created_at < cursor.created_at OR (created_at == cursor.created_at AND id < cursor.id)
                cursor_created_at = cursor.get('created_at')
                cursor_id = cursor.get('id')
                cursor_type = cursor.get('type')  # 'loc' or 'rev'

                if cursor_created_at and cursor_id:
                    cursor_dt = datetime.fromisoformat(cursor_created_at.replace('Z', '+00:00'))
                    location_photos_qs = location_photos_qs.filter(
                        Q(created_at__lt=cursor_dt) |
                        Q(created_at=cursor_dt, id__lt=cursor_id if cursor_type == 'loc' else 0)
                    )
                    review_photos_qs = review_photos_qs.filter(
                        Q(created_at__lt=cursor_dt) |
                        Q(created_at=cursor_dt, id__lt=cursor_id if cursor_type == 'rev' else 0)
                    )

            elif sort == 'oldest':
                # Filter: created_at > cursor.created_at OR (created_at == cursor.created_at AND id > cursor.id)
                cursor_created_at = cursor.get('created_at')
                cursor_id = cursor.get('id')
                cursor_type = cursor.get('type')

                if cursor_created_at and cursor_id:
                    cursor_dt = datetime.fromisoformat(cursor_created_at.replace('Z', '+00:00'))
                    location_photos_qs = location_photos_qs.filter(
                        Q(created_at__gt=cursor_dt) |
                        Q(created_at=cursor_dt, id__gt=cursor_id if cursor_type == 'loc' else float('inf'))
                    )
                    review_photos_qs = review_photos_qs.filter(
                        Q(created_at__gt=cursor_dt) |
                        Q(created_at=cursor_dt, id__gt=cursor_id if cursor_type == 'rev' else float('inf'))
                    )

            elif sort == 'most_upvoted':
                # Filter by upvote_count, then created_at, then id
                cursor_upvotes = cursor.get('upvote_count', 0)
                cursor_created_at = cursor.get('created_at')
                cursor_id = cursor.get('id')
                cursor_type = cursor.get('type')

                if cursor_created_at and cursor_id is not None:
                    cursor_dt = datetime.fromisoformat(cursor_created_at.replace('Z', '+00:00'))
                    # Less upvotes OR (same upvotes AND older) OR (same upvotes AND same time AND lower id)
                    location_photos_qs = location_photos_qs.filter(
                        Q(upvote_count_annotated__lt=cursor_upvotes) |
                        Q(upvote_count_annotated=cursor_upvotes, created_at__lt=cursor_dt) |
                        Q(upvote_count_annotated=cursor_upvotes, created_at=cursor_dt, id__lt=cursor_id if cursor_type == 'loc' else 0)
                    )
                    review_photos_qs = review_photos_qs.filter(
                        Q(upvote_count_annotated__lt=cursor_upvotes) |
                        Q(upvote_count_annotated=cursor_upvotes, created_at__lt=cursor_dt) |
                        Q(upvote_count_annotated=cursor_upvotes, created_at=cursor_dt, id__lt=cursor_id if cursor_type == 'rev' else 0)
                    )

        # Fetch photos from both querysets
        # Fetch more than needed to ensure we have enough after merging
        fetch_limit = limit + 1

        if sort == 'newest':
            location_photos = list(location_photos_qs.order_by('-created_at', '-id')[:fetch_limit])
            review_photos = list(review_photos_qs.order_by('-created_at', '-id')[:fetch_limit])
        elif sort == 'oldest':
            location_photos = list(location_photos_qs.order_by('created_at', 'id')[:fetch_limit])
            review_photos = list(review_photos_qs.order_by('created_at', 'id')[:fetch_limit])
        else:  # most_upvoted
            location_photos = list(location_photos_qs.order_by('-upvote_count_annotated', '-created_at', '-id')[:fetch_limit])
            review_photos = list(review_photos_qs.order_by('-upvote_count_annotated', '-created_at', '-id')[:fetch_limit])

        # Serialize photos to a common format
        def serialize_location_photo(photo):
            # Fall back to location's added_by if no uploader (matches main location endpoint)
            uploader = photo.uploaded_by if photo.uploaded_by else location.added_by
            profile = uploader.userprofile if uploader else None
            # Compute display_name from user's first/last name (UserProfile doesn't have this field)
            display_name = None
            if uploader:
                full_name = f"{uploader.first_name} {uploader.last_name}".strip()
                display_name = full_name if full_name else uploader.username
            return {
                'id': f'loc_{photo.id}',
                'type': 'location',
                'image_url': photo.image.url if photo.image else None,
                'thumbnail_url': photo.thumbnail.url if photo.thumbnail else photo.image.url if photo.image else None,
                'width': photo.width,
                'height': photo.height,
                'caption': photo.caption or '',
                'upvote_count': photo.upvote_count_annotated,
                'user_has_upvoted': photo.id in user_location_votes,
                'created_at': photo.created_at.isoformat(),
                'uploaded_by': {
                    'username': uploader.username,
                    'display_name': display_name,
                    'profile_picture_url': profile.get_profile_picture_url if profile else None,
                    'is_system_account': profile.is_system_account if profile else False,
                } if uploader else None,
                '_sort_created_at': photo.created_at,
                '_sort_id': photo.id,
                '_sort_type': 'loc',
            }

        def serialize_review_photo(photo):
            # Fall back to location's added_by if no review user (matches main location endpoint)
            uploader = photo.review.user if photo.review and photo.review.user else location.added_by
            profile = uploader.userprofile if uploader else None
            # Compute display_name from user's first/last name (UserProfile doesn't have this field)
            display_name = None
            if uploader:
                full_name = f"{uploader.first_name} {uploader.last_name}".strip()
                display_name = full_name if full_name else uploader.username
            return {
                'id': f'rev_{photo.id}',
                'type': 'review',
                'image_url': photo.image.url if photo.image else None,
                'thumbnail_url': photo.thumbnail.url if photo.thumbnail else photo.image.url if photo.image else None,
                'width': photo.width,
                'height': photo.height,
                'caption': photo.caption or '',
                'upvote_count': photo.upvote_count_annotated,
                'user_has_upvoted': photo.id in user_review_votes,
                'created_at': photo.created_at.isoformat(),
                'uploaded_by': {
                    'username': uploader.username,
                    'display_name': display_name,
                    'profile_picture_url': profile.get_profile_picture_url if profile else None,
                    'is_system_account': profile.is_system_account if profile else False,
                } if uploader else None,
                'review_id': photo.review.id if photo.review else None,
                '_sort_created_at': photo.created_at,
                '_sort_id': photo.id,
                '_sort_type': 'rev',
            }

        # Serialize all photos
        serialized = [serialize_location_photo(p) for p in location_photos]
        serialized.extend([serialize_review_photo(p) for p in review_photos])

        # Sort combined results
        if sort == 'newest':
            serialized.sort(key=lambda x: (x['_sort_created_at'], x['_sort_id']), reverse=True)
        elif sort == 'oldest':
            serialized.sort(key=lambda x: (x['_sort_created_at'], x['_sort_id']))
        else:  # most_upvoted
            serialized.sort(key=lambda x: (-x['upvote_count'], x['_sort_created_at'], x['_sort_id']), reverse=False)
            serialized.sort(key=lambda x: (-x['upvote_count'], -x['_sort_created_at'].timestamp(), -x['_sort_id']))

        # Check if there are more results
        has_more = len(serialized) > limit
        results = serialized[:limit]

        # Build next cursor from last item
        next_cursor = None
        if has_more and results:
            last = results[-1]
            cursor_data = {
                'created_at': last['_sort_created_at'].isoformat(),
                'id': last['_sort_id'],
                'type': last['_sort_type'],
            }
            if sort == 'most_upvoted':
                cursor_data['upvote_count'] = last['upvote_count']
            next_cursor = encode_cursor(cursor_data)

        # Clean up internal sort fields from response
        for item in results:
            del item['_sort_created_at']
            del item['_sort_id']
            del item['_sort_type']

        return Response({
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more,
            'total_count': total_count,
        })


