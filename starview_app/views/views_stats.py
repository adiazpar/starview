# ----------------------------------------------------------------------------------------------------- #
# Platform Statistics Endpoint                                                                          #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides public platform-wide statistics for the home page hero section. Returns counts for           #
# locations, reviews, and registered users (stargazers). Used by the frontend to display real           #
# community metrics instead of placeholder data.                                                        #
#                                                                                                       #
# Architecture:                                                                                         #
# - Plain Django function-based view (not DRF) for simplicity                                           #
# - No authentication required (public endpoint)                                                        #
# - Results are cached for 5 minutes to reduce database load                                            #
# - Returns formatted counts (e.g., "2.4k+") for display                                                #
# ----------------------------------------------------------------------------------------------------- #

from django.http import JsonResponse
from django.core.cache import cache
from django.contrib.auth import get_user_model
from ..models import Location, Review

User = get_user_model()

# Cache timeout in seconds (5 minutes)
STATS_CACHE_TIMEOUT = 300


# ----------------------------------------------------------------------------- #
# Format a count for display.                                                   #
# - Under 1000: show exact number (e.g., "847")                                 #
# - 1000+: show with 'k' suffix (e.g., "2.4k+")                                 #
# - 1000000+: show with 'M' suffix (e.g., "1.2M+")                              #
# ----------------------------------------------------------------------------- #
def format_count(count):

    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M+"
    elif count >= 1000:
        return f"{count / 1000:.1f}k+"
    else:
        return str(count)


# ----------------------------------------------------------------------------- #
# Returns platform-wide statistics for the home page.                           #
#                                                                               #
# Response format:                                                              #
# {                                                                             #
#       "locations": {"count": 2400, "formatted": "2.4k+"},                     #
#       "reviews": {"count": 12000, "formatted": "12k+"},                       #
#       "stargazers": {"count": 8500, "formatted": "8.5k+"}                     #
# }                                                                             #
# ----------------------------------------------------------------------------- #
def get_platform_stats(request):

    # Try to get cached stats
    cache_key = "platform_stats"
    cached_stats = cache.get(cache_key)

    if cached_stats:
        return JsonResponse(cached_stats)

    # Fetch fresh counts from database
    location_count = Location.objects.count()
    review_count = Review.objects.count()
    user_count = User.objects.filter(is_active=True).count()

    stats = {
        "locations": {
            "count": location_count,
            "formatted": format_count(location_count)
        },
        "reviews": {
            "count": review_count,
            "formatted": format_count(review_count)
        },
        "stargazers": {
            "count": user_count,
            "formatted": format_count(user_count)
        }
    }

    # Cache the results
    cache.set(cache_key, stats, STATS_CACHE_TIMEOUT)

    return JsonResponse(stats)
