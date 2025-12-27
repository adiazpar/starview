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


# Generate cache key for map markers endpoint:
def map_markers_key():
    return 'map_markers:all'


# Generate cache key for review list endpoint (with pagination):
def review_list_key(location_id, page=1):
    return f'reviews:location:{location_id}:page:{page}'


# Generate cache key for user's favorite locations:
def user_favorites_key(user_id):
    return f'favorites:user:{user_id}'



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
# Note: Clears pages 1-10 which covers most traffic. Future enhancement could   #
# use Redis SCAN to clear all matching keys or implement cache versioning.      #
# ----------------------------------------------------------------------------- #
def invalidate_location_list():
    # Clear common pages (1-10 covers most traffic)
    for page in range(1, 11):
        cache.delete(location_list_key(page))


# Clear cached location detail for a specific location:
def invalidate_location_detail(location_id):
    cache.delete(location_detail_key(location_id))


# Clear cached map markers (affects all locations):
def invalidate_map_markers():
    cache.delete(map_markers_key())


# Clear cached map markers for a specific user:
def invalidate_user_map_markers(user_id):
    cache.delete(f'{map_markers_key()}:user:{user_id}')


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
# map markers, and review list. Use this when a location is updated             #
# significantly or when you want to ensure all related caches are fresh.        #
# ----------------------------------------------------------------------------- #
def invalidate_all_location_caches(location_id):
    invalidate_location_detail(location_id)
    invalidate_location_list()
    invalidate_map_markers()
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
