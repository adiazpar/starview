# ----------------------------------------------------------------------------------------------------- #
# Weather Forecast API Endpoint                                                                        #
#                                                                                                      #
# Purpose:                                                                                             #
# Provides weather data for stargazing planning. Returns cloud cover, atmospheric seeing,             #
# transparency, and other meteorological conditions. Helps users identify optimal nights              #
# for astronomical observation.                                                                       #
#                                                                                                      #
# Architecture:                                                                                        #
# - Plain Django function-based view (public endpoint, no authentication)                            #
# - Results cached for 30 minutes (weather changes slowly, APIs update hourly)                       #
# - Graceful degradation when external APIs fail (partial data returned)                             #
# - Coordinate rounding to ~1km precision reduces cache fragmentation                                #
#                                                                                                      #
# Data Sources:                                                                                        #
# - 7Timer: Astronomy-specific (seeing, transparency) - 3-day forecast                               #
# - Open-Meteo: General weather (cloud layers, visibility) - up to 7-day forecast                    #
# ----------------------------------------------------------------------------------------------------- #

from django.core.cache import cache
from django.http import JsonResponse

from ..services.weather_service import WeatherService
from ..utils.cache import weather_cache_key, WEATHER_CACHE_TIMEOUT

# Maximum forecast days allowed
MAX_FORECAST_DAYS = 7


def get_weather_forecast(request):
    """
    GET /api/weather/

    Query Parameters:
        lat: Latitude (-90 to 90, required)
        lng: Longitude (-180 to 180, required)
        days: Forecast days (1-7, default: 3)

    Returns:
        JSON with current conditions and hourly forecast.

    Error Responses:
        400: Invalid parameters
        503: All weather APIs unavailable
    """
    # Parse required parameters
    lat_str = request.GET.get('lat')
    lng_str = request.GET.get('lng')

    if not lat_str or not lng_str:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'lat and lng parameters are required.',
            'status_code': 400
        }, status=400)

    try:
        lat = float(lat_str)
        lng = float(lng_str)
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            raise ValueError("Coordinates out of range")
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'Invalid lat/lng. lat must be -90 to 90, lng must be -180 to 180.',
            'status_code': 400
        }, status=400)

    # Parse optional days parameter
    days_str = request.GET.get('days', '3')
    try:
        days = int(days_str)
        if not (1 <= days <= MAX_FORECAST_DAYS):
            raise ValueError("Days out of range")
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': f'days must be an integer between 1 and {MAX_FORECAST_DAYS}.',
            'status_code': 400
        }, status=400)

    # Check cache first
    cache_key = weather_cache_key(lat, lng)
    cached_data = cache.get(cache_key)

    if cached_data:
        # Cache hit - return cached data
        return JsonResponse(cached_data)

    # Cache miss - fetch from APIs
    weather_data = WeatherService.get_weather_forecast(lat, lng, days)

    # Check if we got any data
    sources = weather_data.get('sources', {})
    if not sources.get('seven_timer') and not sources.get('open_meteo'):
        return JsonResponse({
            'error': 'service_unavailable',
            'message': 'Weather services are temporarily unavailable. Please try again later.',
            'status_code': 503
        }, status=503)

    # Cache the result
    cache.set(cache_key, weather_data, WEATHER_CACHE_TIMEOUT)

    return JsonResponse(weather_data)
