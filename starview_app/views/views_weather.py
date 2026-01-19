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
# - Unified API contract with date range support (start_date/end_date)                               #
# - Automatic data source selection: forecast, historical, or historical averages                    #
# - Results cached with different TTLs based on data type                                            #
# - Coordinate rounding to ~11km precision for weather (regional data)                               #
#                                                                                                      #
# Data Sources:                                                                                        #
# - 7Timer: Astronomy-specific (seeing, transparency) - 3-day forecast                               #
# - Open-Meteo Forecast: Up to 16-day weather predictions                                            #
# - Open-Meteo Archive: Historical weather data (1940 to present)                                    #
# ----------------------------------------------------------------------------------------------------- #

from datetime import date, datetime, timedelta, timezone

from django.core.cache import cache
from django.http import JsonResponse
from timezonefinder import TimezoneFinder
import pytz

from ..services.weather_service import WeatherService

# Shared timezone finder instance (threadsafe)
_tz_finder = TimezoneFinder()
from ..utils.cache import (
    weather_forecast_cache_key,
    weather_cache_key,
    WEATHER_FORECAST_CACHE_TIMEOUT,
    WEATHER_CACHE_TIMEOUT,
)

# Maximum date range allowed per request
MAX_DATE_RANGE_DAYS = 31


def get_weather_forecast(request):
    """
    GET /api/weather/

    Query Parameters:
        lat: Latitude (-90 to 90, required)
        lng: Longitude (-180 to 180, required)
        start_date: Start date YYYY-MM-DD (optional, default: today)
        end_date: End date YYYY-MM-DD (optional, default: start_date)
        days: DEPRECATED - Forecast days (1-16, for backward compatibility)

    Returns:
        JSON with current conditions, daily forecasts, and metadata.

    Response Structure:
        {
            "location": {"lat": 34.1, "lng": -116.5},
            "generated_at": "2026-01-10T15:30:00Z",
            "current": { ... },
            "daily": [
                {
                    "date": "2026-01-10",
                    "data_type": "forecast|historical|historical_average",
                    "summary": { ... },
                    "hourly": [ ... ]
                }
            ],
            "sources": {"seven_timer": true, "open_meteo": true},
            "warnings": []
        }

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

    # Determine "today" based on the location's timezone, not server UTC
    # This ensures hourly data aligns with the user's local date
    tz_name = _tz_finder.timezone_at(lat=lat, lng=lng)
    if tz_name:
        local_tz = pytz.timezone(tz_name)
        today = datetime.now(local_tz).date()
    else:
        today = date.today()

    # Parse date range with backward compatibility
    start_date, end_date, parse_error = _parse_date_range(request, today)

    if parse_error:
        return JsonResponse({
            'error': 'validation_error',
            'message': parse_error,
            'status_code': 400
        }, status=400)

    # Validate date range
    if end_date < start_date:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'end_date must be on or after start_date.',
            'status_code': 400
        }, status=400)

    if (end_date - start_date).days > MAX_DATE_RANGE_DAYS:
        return JsonResponse({
            'error': 'validation_error',
            'message': f'Date range cannot exceed {MAX_DATE_RANGE_DAYS} days.',
            'status_code': 400
        }, status=400)

    # Check cache first - uses ~11km grid (1 decimal precision)
    # Include both start and end dates in cache key to avoid returning partial results
    cache_key = weather_forecast_cache_key(lat, lng, f"{start_date.isoformat()}_{end_date.isoformat()}")
    cached_data = cache.get(cache_key)

    if cached_data:
        response = JsonResponse(cached_data)
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response['Pragma'] = 'no-cache'
        response['Expires'] = '0'
        return response

    # Fetch fresh data from weather APIs
    weather_data = WeatherService.get_weather_for_range(lat, lng, start_date, end_date, reference_today=today)

    # Cache the result (30 min for forecast data)
    cache.set(cache_key, weather_data, WEATHER_FORECAST_CACHE_TIMEOUT)

    # Check if we got any data
    sources = weather_data.get('sources', {})
    if not sources.get('seven_timer') and not sources.get('open_meteo'):
        # Check if we at least have historical data
        has_data = any(
            day.get('hourly') or day.get('summary')
            for day in weather_data.get('daily', [])
        )
        if not has_data:
            return JsonResponse({
                'error': 'service_unavailable',
                'message': 'Weather services are temporarily unavailable. Please try again later.',
                'status_code': 503
            }, status=503)

    # Return with no-cache headers to prevent browser caching
    response = JsonResponse(weather_data)
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response


def _parse_date_range(request, today: date):
    """
    Parse date range from request with backward compatibility.

    Priority:
    1. start_date + end_date (new unified format)
    2. start_date only -> end_date = start_date
    3. days param (deprecated) -> start_date = today, end_date = today + days - 1
    4. No params -> today only

    Returns:
        Tuple of (start_date, end_date, error_message)
        error_message is None if parsing succeeded
    """
    start_str = request.GET.get('start_date')
    end_str = request.GET.get('end_date')
    days_str = request.GET.get('days')

    # New unified format: start_date and/or end_date
    if start_str:
        try:
            start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        except ValueError:
            return None, None, 'Invalid start_date format. Use YYYY-MM-DD.'

        if end_str:
            try:
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
            except ValueError:
                return None, None, 'Invalid end_date format. Use YYYY-MM-DD.'
        else:
            end_date = start_date

        return start_date, end_date, None

    # Backward compatibility: days parameter
    if days_str:
        try:
            days = int(days_str)
            if not (1 <= days <= 16):
                return None, None, 'days must be an integer between 1 and 16.'
        except ValueError:
            return None, None, 'days must be an integer between 1 and 16.'

        return today, today + timedelta(days=days - 1), None

    # Default: today only
    return today, today, None
