# ----------------------------------------------------------------------------------------------------- #
# Moon Phases API Endpoint                                                                             #
#                                                                                                      #
# Purpose:                                                                                             #
# Provides moon phase calculations for stargazing planning. Returns phase names, illumination         #
# percentages, and optionally moonrise/moonset times for specific locations. Helps users identify    #
# optimal stargazing nights (low illumination = darker skies).                                        #
#                                                                                                      #
# Architecture:                                                                                        #
# - Plain Django function-based view (public endpoint, no authentication)                            #
# - Unified API contract with date range support (start_date/end_date)                               #
# - All moon data is computed deterministically (data_type: "computed")                              #
# - Results cached for 24 hours (moon calculations are deterministic)                                #
# - Date range bounded to 31 days to prevent expensive computations                                   #
# - Optional lat/lng parameters enable location-specific moonrise/moonset times                       #
# ----------------------------------------------------------------------------------------------------- #

from datetime import datetime, timedelta

from django.core.cache import cache
from django.http import JsonResponse

from ..services.moon_service import (
    get_moon_data_unified,
    get_next_key_dates,
    get_key_dates_in_range,
)
from ..utils.cache import (
    moon_cache_key,
    MOON_CACHE_TIMEOUT,
    MOON_NO_LOCATION_CACHE_TIMEOUT,
)

# Maximum date range allowed per request
MAX_DATE_RANGE_DAYS = 31
# Extended range for key_dates_only (returns far fewer results)
MAX_DATE_RANGE_KEY_DATES = 90


def get_moon_phases(request):
    """
    GET /api/moon-phases/

    Query Parameters:
        start_date: YYYY-MM-DD (default: today)
        end_date: YYYY-MM-DD (default: start_date, i.e., today only)
        lat: Latitude for moonrise/moonset (optional)
        lng: Longitude for moonrise/moonset (optional)
        key_dates_only: Return only key phase dates (optional, default: false)

    Returns:
        JSON with unified response structure:
        {
            "location": {"lat": 34.1, "lng": -116.5},  // if provided
            "generated_at": "2026-01-10T15:30:00Z",
            "current": {
                "timestamp": "...",
                "phase_name": "Waxing Gibbous",
                "illumination": 78.5,
                ...
            },
            "daily": [
                {
                    "date": "2026-01-10",
                    "data_type": "computed",
                    "phase_name": "Waxing Gibbous",
                    ...
                }
            ],
            "key_dates": {...}
        }

    Error Responses:
        400: Invalid parameters
    """
    # Parse date parameters
    today = datetime.now().date()

    start_str = request.GET.get('start_date')
    end_str = request.GET.get('end_date')

    try:
        start_date = datetime.strptime(start_str, '%Y-%m-%d').date() if start_str else today
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'Invalid start_date format. Use YYYY-MM-DD.',
            'status_code': 400
        }, status=400)

    try:
        # Default: end_date = start_date (today only, not start + 7 days)
        end_date = datetime.strptime(end_str, '%Y-%m-%d').date() if end_str else start_date
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'Invalid end_date format. Use YYYY-MM-DD.',
            'status_code': 400
        }, status=400)

    # Parse key_dates_only early (affects validation limits and response format)
    key_dates_only = request.GET.get('key_dates_only', '').lower() in ('true', '1', 'yes')

    # Validate date range
    if end_date < start_date:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'end_date must be on or after start_date.',
            'status_code': 400
        }, status=400)

    # Allow extended range for key_dates_only (returns far fewer results)
    max_days = MAX_DATE_RANGE_KEY_DATES if key_dates_only else MAX_DATE_RANGE_DAYS
    if (end_date - start_date).days > max_days:
        return JsonResponse({
            'error': 'validation_error',
            'message': f'Date range cannot exceed {max_days} days.',
            'status_code': 400
        }, status=400)

    # Parse location parameters (optional)
    lat = None
    lng = None
    lat_str = request.GET.get('lat')
    lng_str = request.GET.get('lng')

    if lat_str and lng_str:
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

    # Convert to datetime for service functions
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.min.time())

    # Handle key_dates_only mode (different response format)
    if key_dates_only:
        response_data = {
            'key_dates': get_key_dates_in_range(start_dt, end_dt)
        }
        return JsonResponse(response_data)

    # Check cache for normal requests
    cache_key_str = moon_cache_key(lat, lng, start_date.isoformat(), end_date.isoformat())
    cache_timeout = MOON_CACHE_TIMEOUT if (lat and lng) else MOON_NO_LOCATION_CACHE_TIMEOUT
    cached_data = cache.get(cache_key_str)

    if cached_data:
        # Always refresh 'current' section for real-time accuracy
        # The cached 'daily' data is still valid, but 'current' should be live
        from ..services.moon_service import get_phase_for_date
        from datetime import timezone as tz
        now = datetime.now(tz.utc)
        current_phase = get_phase_for_date(now, lat, lng)
        cached_data['current'] = {
            'timestamp': now.isoformat(),
            'phase_name': current_phase.get('phase_name'),
            'phase_emoji': current_phase.get('phase_emoji'),
            'illumination': current_phase.get('illumination'),
            'phase_angle': current_phase.get('phase_angle'),
            'is_waning': current_phase.get('is_waning'),
            'is_good_for_stargazing': current_phase.get('is_good_for_stargazing'),
        }
        # Add location-specific fields if available
        if current_phase.get('next_moonrise'):
            cached_data['current']['next_moonrise'] = current_phase['next_moonrise']
        if current_phase.get('next_moonset'):
            cached_data['current']['next_moonset'] = current_phase['next_moonset']
        if current_phase.get('rotation_angle') is not None:
            cached_data['current']['rotation_angle'] = current_phase['rotation_angle']
        cached_data['generated_at'] = now.isoformat()
        return JsonResponse(cached_data)

    # Get unified moon data
    response_data = get_moon_data_unified(start_dt, end_dt, lat, lng)

    # Add key_dates for convenience (existing feature)
    response_data['key_dates'] = get_next_key_dates(start_dt)

    # Cache the result
    cache.set(cache_key_str, response_data, cache_timeout)

    return JsonResponse(response_data)
