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
from starview_app.utils import ContentCreationThrottle, ReportThrottle

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
                    # Validate bounds
                    if -180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90:
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
    @action(detail=True, methods=['POST'], permission_classes=[IsAuthenticated])
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
    @action(detail=True, methods=['DELETE'], permission_classes=[IsAuthenticated])
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
    # Hero Carousel - Random location images for homepage.                          #
    #                                                                               #
    # Returns 5 random locations with images for the hero carousel.                 #
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

        cache_key = f'hero_carousel_{date.today().isoformat()}'
        cached_data = cache.get(cache_key)

        if cached_data:
            return Response(cached_data)

        # Get locations that have at least one photo (location or review photo)
        locations_with_photos = Location.objects.filter(
            Q(photos__isnull=False) | Q(reviews__photos__isnull=False)
        ).distinct().prefetch_related(
            Prefetch(
                'photos',
                queryset=LocationPhoto.objects.order_by('-created_at'),
                to_attr='prefetched_photos'
            ),
            Prefetch(
                'reviews__photos',
                queryset=ReviewPhoto.objects.order_by('-created_at'),
            )
        )

        # Convert to list and seed random with today's date for consistency
        location_list = list(locations_with_photos)

        if not location_list:
            return Response([])

        # Use date as seed so all users see same images each day
        random.seed(date.today().toordinal())
        selected = random.sample(location_list, min(5, len(location_list)))
        random.seed()  # Reset seed

        # Build response with image URLs
        result = []
        for loc in selected:
            # Get first available image (prefer location photos)
            image_url = None
            if hasattr(loc, 'prefetched_photos') and loc.prefetched_photos:
                image_url = loc.prefetched_photos[0].image_url
            else:
                # Check review photos
                for review in loc.reviews.all():
                    if review.photos.exists():
                        image_url = review.photos.first().image_url
                        break

            if image_url:
                result.append({
                    'id': loc.id,
                    'name': loc.name,
                    'image_url': image_url,
                })

        # Cache until midnight UTC
        now = datetime.now(dt_timezone.utc)
        midnight = datetime(now.year, now.month, now.day, tzinfo=dt_timezone.utc)
        midnight = midnight.replace(day=now.day + 1)
        seconds_until_midnight = int((midnight - now).total_seconds())
        cache.set(cache_key, result, timeout=seconds_until_midnight)

        return Response(result)


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


