# ----------------------------------------------------------------------------------------------------- #
# This cache.py file provides centralized Redis caching utilities for Starview:                        #
#                                                                                                       #
# Purpose:                                                                                              #
# Manages cache key generation and invalidation for all cached API endpoints. Centralizing cache        #
# logic here prevents key collisions, ensures consistent naming patterns, and makes cache               #
# invalidation straightforward when data changes.                                                       #
#                                                                                                       #
# Key Features:                                                                                         #
# - Cache key generators for all endpoints (locations, reviews, map markers)                            #
# - Invalidation helpers that clear related caches when data changes                                    #
# - User-aware caching (authenticated vs anonymous users get different cache keys)                      #
# - Page-aware caching for paginated endpoints                                                          #
#                                                                                                       #
# Cache Strategy:                                                                                       #
# - Location list/detail: 15 minutes (900s) - frequent access, moderate change rate                     #
# - Map markers: 30 minutes (1800s) - very frequent access, low change rate                             #
# - Review list: 15 minutes (900s) - moderate access, moderate change rate                              #
#                                                                                                       #
# Design Pattern:                                                                                       #
# All cache keys are prefixed with 'starview:' (configured in settings.py) to prevent collisions        #
# when sharing Redis with other applications. Keys use consistent naming: resource:action:id format.    #
#                                                                                                       #
# Integration with Views:                                                                               #
# ViewSets import these utilities to check cache before database queries (list/retrieve methods) and    #
# to invalidate cache after mutations (perform_create/update/destroy methods).                          #
#                                                                                                       #
# Created: 2025-10-26 (Phase 2.4 - Redis Caching Implementation)                                        #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.core.cache import cache



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       CACHE KEY GENERATORS                                            #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# Generate cache key for location list endpoint (with pagination):
def location_list_key(page=1):
    return f'location_list:page:{page}'


# Generate cache key for location detail endpoint:
def location_detail_key(location_id):
    return f'location_detail:{location_id}'


# ----------------------------------------------------------------------------- #
# Map GeoJSON Cache Versioning                                                  #
#                                                                               #
# Uses version-based invalidation for efficient cache clearing. When location  #
# data changes, we bump a version number instead of deleting individual keys.  #
# All old versioned keys become orphaned and expire naturally (30 min TTL).    #
#                                                                               #
# Benefits:                                                                     #
# - O(1) invalidation regardless of number of cached users                     #
# - All users see fresh data immediately after location changes                #
# - No need to track individual user cache keys                                #
# ----------------------------------------------------------------------------- #
MAP_GEOJSON_VERSION_KEY = 'map_geojson:version'


def get_map_geojson_version():
    """Get current cache version, initializing to 1 if not set."""
    version = cache.get(MAP_GEOJSON_VERSION_KEY)
    if version is None:
        # Initialize version (never expires)
        cache.set(MAP_GEOJSON_VERSION_KEY, 1, timeout=None)
        return 1
    return version


def map_geojson_key():
    """Generate versioned cache key for map GeoJSON."""
    version = get_map_geojson_version()
    return f'map_geojson:v{version}:all'


# Generate cache key for review list endpoint (with pagination):
def review_list_key(location_id, page=1):
    return f'reviews:location:{location_id}:page:{page}'


# Generate cache key for user's favorite locations:
def user_favorites_key(user_id):
    return f'favorites:user:{user_id}'


# ----------------------------------------------------------------------------- #
# Weather Cache Configuration                                                   #
#                                                                               #
# Weather data from external APIs (7Timer, Open-Meteo) is cached to reduce     #
# API calls and improve response times. Different data types have different    #
# cache durations and coordinate precision.                                    #
#                                                                               #
# Data Types:                                                                  #
# - Forecast (today to +16 days): 30 min TTL, ~11km grid (1 decimal)          #
# - Historical (past dates): 7 day TTL, ~11km grid (immutable data)           #
# - Historical Average (>16 days future): 30 day TTL, ~11km grid              #
#                                                                               #
# Coordinate Precision:                                                         #
# - Weather uses 1 decimal (~11km) - weather is regional                       #
# - Moon uses 2 decimals (~1km) - moonrise/moonset times need precision        #
# ----------------------------------------------------------------------------- #
WEATHER_FORECAST_CACHE_TIMEOUT = 1800       # 30 minutes - forecasts change
WEATHER_HISTORICAL_CACHE_TIMEOUT = 604800   # 7 days - past weather is immutable
WEATHER_HIST_AVG_CACHE_TIMEOUT = 2592000    # 30 days - statistical averages are stable
MOON_CACHE_TIMEOUT = 86400                  # 24 hours - moon data with location
MOON_NO_LOCATION_CACHE_TIMEOUT = 604800     # 7 days - moon phases without location

# Legacy constant for backward compatibility
WEATHER_CACHE_TIMEOUT = WEATHER_FORECAST_CACHE_TIMEOUT


def weather_forecast_cache_key(lat, lng, date_str):
    """
    Cache key for forecast data (today to +16 days).

    Uses 1 decimal precision (~11km grid) because weather is regional -
    same cloud cover applies across a ~10km area.

    Args:
        lat: Latitude
        lng: Longitude
        date_str: Date string (YYYY-MM-DD)

    Returns:
        Cache key string
    """
    rounded_lat = round(float(lat), 1)
    rounded_lng = round(float(lng), 1)
    return f'weather:forecast:{rounded_lat}:{rounded_lng}:{date_str}'


def weather_historical_cache_key(lat, lng, date_str):
    """
    Cache key for historical weather data (past dates).

    Same ~11km grid as forecast. Historical data is immutable so
    cache TTL is longer (7 days).

    Args:
        lat: Latitude
        lng: Longitude
        date_str: Date string (YYYY-MM-DD)

    Returns:
        Cache key string
    """
    rounded_lat = round(float(lat), 1)
    rounded_lng = round(float(lng), 1)
    return f'weather:historical:{rounded_lat}:{rounded_lng}:{date_str}'


def weather_hist_avg_cache_key(lat, lng, month, day):
    """
    Cache key for historical average data (>16 days in future).

    Key uses month/day only (no year) because the average for
    "March 15th" is the same regardless of which year is requested.

    Args:
        lat: Latitude
        lng: Longitude
        month: Month (1-12)
        day: Day (1-31)

    Returns:
        Cache key string
    """
    rounded_lat = round(float(lat), 1)
    rounded_lng = round(float(lng), 1)
    return f'weather:hist_avg:{rounded_lat}:{rounded_lng}:{month:02d}:{day:02d}'


def moon_cache_key(lat, lng, start_date, end_date):
    """
    Cache key for moon phase data.

    Uses 2 decimal precision (~1km grid) because moonrise/moonset
    times vary more with location than weather does.

    Args:
        lat: Latitude (or None for no location)
        lng: Longitude (or None for no location)
        start_date: Start date string (YYYY-MM-DD)
        end_date: End date string (YYYY-MM-DD)

    Returns:
        Cache key string
    """
    if lat is not None and lng is not None:
        rounded_lat = round(float(lat), 2)
        rounded_lng = round(float(lng), 2)
        return f'moon:{rounded_lat}:{rounded_lng}:{start_date}:{end_date}'
    else:
        # No location - moon phases are global
        return f'moon:phases:{start_date}:{end_date}'


# Legacy function for backward compatibility (deprecated)
def weather_cache_key(lat, lng):
    """
    DEPRECATED: Use weather_forecast_cache_key() instead.

    Generate cache key with rounded coordinates to reduce fragmentation.
    Kept for backward compatibility during transition period.
    """
    rounded_lat = round(float(lat), 1)
    rounded_lng = round(float(lng), 1)
    return f'weather:forecast:{rounded_lat}:{rounded_lng}'



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       CACHE INVALIDATION HELPERS                                      #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Invalidate all cached location list pages.                                    #
#                                                                               #
# Call this when: new location created, location deleted, or location data      #
# changes that affects the list view (e.g., name, verification status).         #
#                                                                               #
# Uses Redis SCAN to find and delete all keys matching the location_list        #
# pattern, including sort-suffixed and user-specific cache variants.            #
# ----------------------------------------------------------------------------- #
def invalidate_location_list():
    # Use Redis directly for pattern-based deletion
    # This catches all variants: :sort:X, :user:Y, :sort:X:user:Y
    from django.conf import settings
    import redis

    redis_url = settings.CACHES['default']['LOCATION']
    r = redis.from_url(redis_url)

    # Pattern matches all location list keys (with starview: prefix from settings)
    pattern = 'starview:location_list:*'
    keys = list(r.scan_iter(match=pattern))
    if keys:
        r.delete(*keys)


# Clear cached location detail for a specific location:
def invalidate_location_detail(location_id):
    cache.delete(location_detail_key(location_id))


# ----------------------------------------------------------------------------- #
# Invalidate ALL map GeoJSON caches by bumping version.                         #
#                                                                               #
# Instead of deleting individual keys (which would require tracking all users), #
# we increment the version number. All existing caches become orphaned since    #
# new requests look for the new version. Orphaned keys expire via TTL.          #
#                                                                               #
# Call this when: location created, updated, or deleted.                        #
# ----------------------------------------------------------------------------- #
def invalidate_map_geojson():
    try:
        cache.incr(MAP_GEOJSON_VERSION_KEY)
    except ValueError:
        # Key doesn't exist yet - initialize it
        cache.set(MAP_GEOJSON_VERSION_KEY, 1, timeout=None)


# ----------------------------------------------------------------------------- #
# Invalidate a specific user's map GeoJSON cache.                               #
#                                                                               #
# Used for user-specific changes like toggling favorites. Only clears that      #
# user's cache, not everyone's. Uses current version so it deletes the right    #
# key (e.g., 'map_geojson:v3:all:user:42').                                     #
# ----------------------------------------------------------------------------- #
def invalidate_user_map_geojson(user_id):
    cache.delete(f'{map_geojson_key()}:user:{user_id}')


# ----------------------------------------------------------------------------- #
# Invalidate all cached review pages for a location.                            #
#                                                                               #
# Call this when: new review added, review updated/deleted for this location.   #
# Clears pages 1-5 which covers most locations (locations with 100+ reviews     #
# are rare, and their later pages will expire naturally).                       #
# ----------------------------------------------------------------------------- #
def invalidate_review_list(location_id):
    # Clear common pages (1-5 covers most locations)
    for page in range(1, 6):
        cache.delete(review_list_key(location_id, page))


# Clear cached favorite locations for a user:
def invalidate_user_favorites(user_id):
    cache.delete(user_favorites_key(user_id))


# ----------------------------------------------------------------------------- #
# Invalidate ALL caches related to a specific location.                         #
#                                                                               #
# This is a convenience function that clears: location detail, location list,   #
# map GeoJSON, and review list. Use this when a location is                      #
# updated significantly or when you want to ensure all related caches are fresh.#
# ----------------------------------------------------------------------------- #
def invalidate_all_location_caches(location_id):
    invalidate_location_detail(location_id)
    invalidate_location_list()
    invalidate_map_geojson()
    invalidate_review_list(location_id)



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       CACHE GETTER HELPERS                                            #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Get cached value or compute and cache it.                                     #
#                                                                               #
# This is a wrapper around Django's cache.get_or_set() that provides            #
# consistent timeout defaults. Use this when you want to cache the result of    #
# an expensive operation with a single function call.                           #
#                                                                               #
# Example:                                                                      #
#   data = get_or_set_cache(                                                    #
#       location_list_key(page=1),                                              #
#       lambda: expensive_database_query(),                                     #
#       timeout=1800  # 30 minutes                                              #
#   )                                                                           #
# ----------------------------------------------------------------------------- #
def get_or_set_cache(key, callable_func, timeout=900):
    return cache.get_or_set(key, callable_func, timeout=timeout)



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                   CACHE DEBUGGING HELPERS (Development)                               #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Clear ALL caches in the system.                                               #
#                                                                               #
# WARNING: This clears EVERYTHING including rate limiting throttle data.        #
# Only use in development or when absolutely necessary. For production,         #
# prefer targeted invalidation functions (invalidate_location_detail, etc).     #
# ----------------------------------------------------------------------------- #
def clear_all_caches():
    cache.clear()


# ----------------------------------------------------------------------------- #
# Get information about current cache state (for debugging).                    #
#                                                                               #
# Note: Django's cache API doesn't provide a way to list all keys. In           #
# development, use Redis CLI directly to inspect keys. In production with       #
# millions of keys, this could be slow - use Redis monitoring tools instead.    #
# ----------------------------------------------------------------------------- #
def get_cache_stats():
    return {
        'message': 'Use Redis CLI to inspect keys: redis-cli KEYS "starview:*"',
        'clear_command': 'redis-cli FLUSHDB  # WARNING: Clears ALL data in current DB',
    }
