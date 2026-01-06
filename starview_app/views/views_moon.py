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
# - Results cached for 24 hours (moon phase data is deterministic for any given date)                #
# - Date range bounded to 31 days to prevent expensive computations                                   #
# - Optional lat/lng parameters enable location-specific moonrise/moonset times                       #
# ----------------------------------------------------------------------------------------------------- #

from datetime import datetime, timedelta
from django.http import JsonResponse
from django.core.cache import cache

from ..services.moon_service import (
    get_phases_for_range,
    get_next_key_dates,
    get_key_dates_in_range,
)

# Cache timeout: 24 hours (moon data is deterministic for any date)
MOON_CACHE_TIMEOUT = 86400

# Maximum date range allowed per request
MAX_DATE_RANGE_DAYS = 31
# Extended range for key_dates_only (returns far fewer results)
MAX_DATE_RANGE_KEY_DATES = 90


def get_moon_phases(request):
    """
    GET /api/moon-phases/

    Query Parameters:
        start_date: YYYY-MM-DD (default: today)
        end_date: YYYY-MM-DD (default: start_date + 7 days)
        lat: Latitude for moonrise/moonset (optional)
        lng: Longitude for moonrise/moonset (optional)
        key_dates_only: Return only key phase dates (optional, default: false)

    Returns:
        JSON with phases array and key_dates object
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
        end_date = datetime.strptime(end_str, '%Y-%m-%d').date() if end_str else start_date + timedelta(days=7)
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'Invalid end_date format. Use YYYY-MM-DD.',
            'status_code': 400
        }, status=400)

    # Parse key_dates_only early (affects validation limits)
    key_dates_only = request.GET.get('key_dates_only', '').lower() in ('true', '1', 'yes')

    # Validate date range
    if end_date < start_date:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'end_date must be after start_date.',
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

    # Build cache key
    cache_key = f"moon_phases:{start_date}:{end_date}"
    if lat is not None:
        cache_key += f":{lat:.4f}:{lng:.4f}"
    if key_dates_only:
        cache_key += ":key_only"

    # Check cache first
    cached_data = cache.get(cache_key)
    if cached_data:
        return JsonResponse(cached_data)

    # Convert to datetime for service functions
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.min.time())

    # Build response based on mode
    if key_dates_only:
        response_data = {
            'key_dates': get_key_dates_in_range(start_dt, end_dt)
        }
    else:
        response_data = {
            'phases': get_phases_for_range(start_dt, end_dt, lat, lng),
            'key_dates': get_next_key_dates(start_dt),
        }

        if lat is not None:
            response_data['location'] = {'lat': lat, 'lng': lng}

    # Cache and return
    cache.set(cache_key, response_data, MOON_CACHE_TIMEOUT)

    return JsonResponse(response_data)
