# ----------------------------------------------------------------------------------------------------- #
# Moon Phase Calculation Service                                                                       #
#                                                                                                      #
# Purpose:                                                                                             #
# Provides astronomical calculations for moon phases using the PyEphem library. Calculates phase      #
# names, illumination percentages, and optionally moonrise/moonset times for specific observer        #
# locations. Supports Starview's stargazing planning features by identifying optimal dark sky nights. #
#                                                                                                      #
# Architecture:                                                                                        #
# - Standalone functions (no state required for astronomical calculations)                            #
# - Results are cached at the view layer for 24 hours (moon data is deterministic)                   #
# - Date range queries bounded to 31 days to prevent expensive computations                          #
# - Moonrise/moonset times are converted to local timezone using timezonefinder                      #
# ----------------------------------------------------------------------------------------------------- #

import ephem
import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from zoneinfo import ZoneInfo
from timezonefinder import TimezoneFinder

# Singleton timezone finder (expensive to initialize)
_tf = None

def _get_timezone_finder():
    """Lazily initialize the TimezoneFinder singleton."""
    global _tf
    if _tf is None:
        _tf = TimezoneFinder()
    return _tf

# Phase name/emoji mappings based on illumination and waxing/waning state
PHASE_DATA = {
    'new_moon': {'name': 'New Moon', 'emoji': '🌑'},
    'waxing_crescent': {'name': 'Waxing Crescent', 'emoji': '🌒'},
    'first_quarter': {'name': 'First Quarter', 'emoji': '🌓'},
    'waxing_gibbous': {'name': 'Waxing Gibbous', 'emoji': '🌔'},
    'full_moon': {'name': 'Full Moon', 'emoji': '🌕'},
    'waning_gibbous': {'name': 'Waning Gibbous', 'emoji': '🌖'},
    'last_quarter': {'name': 'Last Quarter', 'emoji': '🌗'},
    'waning_crescent': {'name': 'Waning Crescent', 'emoji': '🌘'},
}

# Illumination threshold for "good stargazing" conditions (darker is better)
STARGAZING_THRESHOLD = 25.0


def get_phase_for_date(
    date: datetime,
    lat: Optional[float] = None,
    lng: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calculate moon phase data for a specific date.

    Returns dictionary with phase_name, phase_emoji, illumination, phase_angle,
    is_good_for_stargazing, and optionally moonrise/moonset times if location provided.

    For illumination: Uses current UTC time if date is today, otherwise noon UTC.
    For moonrise/moonset: Calculates for the observer's local date and converts to local time.
    """
    # Use current time for "today" (accounting for global timezone differences)
    #
    # The maximum timezone offset from UTC is ±14 hours, meaning a user's local
    # "today" can differ from UTC "today" by up to 1 day in either direction:
    #   - Western timezones (e.g., LA at 10 PM = next day 6 AM UTC)
    #   - Eastern timezones (e.g., Tokyo at 8 AM = previous day 11 PM UTC)
    #
    # For real-time accuracy, use current UTC time if the target date is within
    # ±1 day of UTC today. This ensures users worldwide get accurate live data.
    now = datetime.utcnow()
    today = now.date()
    target_date = date.date() if isinstance(date, datetime) else date

    days_diff = abs((today - target_date).days)
    if days_diff <= 1:
        # Within ±1 day of UTC today: use current time for real-time accuracy
        calc_time = now
    else:
        # Future or past dates: use noon UTC for consistency
        calc_time = datetime(target_date.year, target_date.month, target_date.day, 12, 0, 0)

    observer = ephem.Observer()
    observer.date = ephem.Date(calc_time)

    moon = ephem.Moon()
    moon.compute(observer)

    # Get illumination percentage (0-100)
    illumination = round(moon.phase, 1)

    # Get phase angle (ephem.phase is 0-100, convert to degrees 0-360)
    phase_angle = round(float(moon.phase) * 3.6, 1)

    # Determine phase name based on illumination and trend
    phase_key, is_waning = _determine_phase(calc_time, illumination)
    phase_info = PHASE_DATA[phase_key]

    result = {
        'date': date.strftime('%Y-%m-%d'),
        'phase_name': phase_info['name'],
        'phase_emoji': phase_info['emoji'],
        'illumination': illumination,
        'phase_angle': phase_angle,
        'is_waning': is_waning,
        'is_good_for_stargazing': illumination < STARGAZING_THRESHOLD,
    }

    # Add next moonrise/moonset and rotation angle if location provided
    if lat is not None and lng is not None:
        rise_set_data = _get_next_moonrise_moonset(lat, lng)
        result['next_moonrise'] = rise_set_data['moonrise']
        result['next_moonset'] = rise_set_data['moonset']

        # Calculate rotation angle for accurate moon display
        # _get_moon_rotation_angle returns θ: where bright limb SHOULD be from "up"
        theta = _get_moon_rotation_angle(calc_time, lat, lng)

        # Offset for SVG shadow orientation:
        # SVG draws waning with bright limb at -90° (left), waxing at +90° (right)
        # To show bright limb at θ: rotation = θ - SVG_default_position
        if is_waning:
            rotation = theta - (-90)  # θ + 90
        else:
            rotation = theta - 90

        # Normalize to -180 to 180
        rotation = ((rotation + 180) % 360) - 180
        result['rotation_angle'] = round(rotation, 1)

    return result


def _get_moon_rotation_angle(calc_time: datetime, lat: float, lng: float) -> float:
    """
    Calculate the rotation angle for displaying the moon as seen from a specific location.

    This combines two angles:
    1. Position angle of the bright limb - which direction the sun is relative to the moon
       (determines which side of the moon is illuminated)
    2. Parallactic angle - how the celestial coordinate system is tilted relative to
       the observer's horizon (depends on latitude and moon's position in sky)

    Returns angle in degrees for rotating the moon graphic, where:
    - 0 means the bright limb is at the top
    - Positive values rotate clockwise
    """
    observer = ephem.Observer()
    observer.lat = str(lat)
    observer.lon = str(lng)
    observer.date = ephem.Date(calc_time)

    moon = ephem.Moon()
    moon.compute(observer)

    sun = ephem.Sun()
    sun.compute(observer)

    # === Position Angle of the Bright Limb ===
    # This is the angle from celestial north to the sun, measured eastward from the moon
    # It tells us which side of the moon is illuminated
    ra_moon = float(moon.ra)
    dec_moon = float(moon.dec)
    ra_sun = float(sun.ra)
    dec_sun = float(sun.dec)

    # Calculate position angle from moon to sun
    delta_ra = ra_sun - ra_moon
    position_angle = math.atan2(
        math.cos(dec_sun) * math.sin(delta_ra),
        math.sin(dec_sun) * math.cos(dec_moon) - math.cos(dec_sun) * math.sin(dec_moon) * math.cos(delta_ra)
    )

    # === Parallactic Angle ===
    # How much the celestial coordinate system is tilted from the observer's perspective
    lst = float(observer.sidereal_time())
    hour_angle = lst - ra_moon

    lat_rad = math.radians(lat)
    sin_h = math.sin(hour_angle)
    cos_h = math.cos(hour_angle)
    sin_dec = math.sin(dec_moon)
    cos_dec = math.cos(dec_moon)
    tan_lat = math.tan(lat_rad)

    parallactic = math.atan2(sin_h, tan_lat * cos_dec - sin_dec * cos_h)

    # === Combined Rotation ===
    # The bright limb angle in horizon coordinates
    # Position angle (PA) gives direction from celestial north to bright limb
    # Parallactic angle (q) is the angle from celestial north to zenith at the moon's position
    # Bright limb from zenith = PA - q (transform from celestial to horizon coords)
    rotation = position_angle - parallactic

    # Convert to degrees and normalize to -180 to 180
    # Negate because CSS rotation is clockwise but astronomical angles are counter-clockwise
    rotation_deg = -math.degrees(rotation)
    rotation_deg = ((rotation_deg + 180) % 360) - 180

    return round(rotation_deg, 1)


def _determine_phase(calc_time: datetime, illumination: float) -> tuple[str, bool]:
    """
    Determine the phase name and waning status based on illumination and trend.

    Compares illumination at calc_time with illumination 24 hours later to determine
    if the moon is waxing (getting brighter) or waning (getting dimmer).

    Returns:
        tuple: (phase_key, is_waning) where phase_key is used for PHASE_DATA lookup
    """
    # Check if waxing (illumination increasing) or waning
    # Compare with 24 hours later
    tomorrow_time = calc_time + timedelta(days=1)
    observer_tomorrow = ephem.Observer()
    observer_tomorrow.date = ephem.Date(tomorrow_time)
    moon_tomorrow = ephem.Moon()
    moon_tomorrow.compute(observer_tomorrow)
    tomorrow_illumination = moon_tomorrow.phase

    is_waxing = tomorrow_illumination > illumination
    is_waning = not is_waxing

    # Determine phase based on illumination percentage and trend
    #
    # Thresholds based on scientific definitions (U.S. Naval Observatory):
    # - Primary phases (New, Quarter, Full) are specific moments, not ranges
    # - Crescent: <50% illumination, Gibbous: >50% illumination
    #
    # We use a 6% window (47-53%) for quarter phases, which corresponds to
    # roughly 1 day around the actual quarter event (~6-7% change per day).
    # This balances scientific accuracy with practical display needs.
    if illumination < 2:
        phase_key = 'new_moon'
    elif illumination > 98:
        phase_key = 'full_moon'
    elif 47 <= illumination <= 53:
        phase_key = 'first_quarter' if is_waxing else 'last_quarter'
    elif illumination < 47:
        phase_key = 'waxing_crescent' if is_waxing else 'waning_crescent'
    else:  # illumination > 53
        phase_key = 'waxing_gibbous' if is_waxing else 'waning_gibbous'

    return phase_key, is_waning


def _get_next_moonrise_moonset(
    lat: float,
    lng: float
) -> Dict[str, Any]:
    """
    Get the NEXT moonrise and moonset times from the current moment.

    Unlike calendar-day based calculations, this returns the actual next events
    which is more useful for stargazing planning (e.g., "when will the moon set
    so I can observe in darkness?").

    Returns dict with:
        moonrise: { time: "HH:MM", label: "Today"/"Tomorrow"/weekday, date: "YYYY-MM-DD" }
        moonset: { time: "HH:MM", label: "Today"/"Tomorrow"/weekday, date: "YYYY-MM-DD" }
    """
    # Get timezone for this location
    tf = _get_timezone_finder()
    tz_name = tf.timezone_at(lat=lat, lng=lng)
    if not tz_name:
        return {'moonrise': None, 'moonset': None}

    local_tz = ZoneInfo(tz_name)
    now_utc = datetime.utcnow()
    now_local = now_utc.replace(tzinfo=ZoneInfo('UTC')).astimezone(local_tz)
    today_local = now_local.date()

    # Set up observer at the location, starting from now
    observer = ephem.Observer()
    observer.lat = str(lat)
    observer.lon = str(lng)
    observer.date = ephem.Date(now_utc)

    moon = ephem.Moon()

    def get_relative_label(event_date, today):
        """Get a human-readable label for the date relative to today."""
        diff = (event_date - today).days
        if diff == 0:
            return "Today"
        elif diff == 1:
            return "Tomorrow"
        else:
            return event_date.strftime('%A')  # Weekday name

    result = {'moonrise': None, 'moonset': None}

    # Find next moonrise
    try:
        rise_time_ephem = observer.next_rising(moon)
        rise_time_utc = ephem.Date(rise_time_ephem).datetime().replace(tzinfo=ZoneInfo('UTC'))
        rise_time_local = rise_time_utc.astimezone(local_tz)
        rise_date = rise_time_local.date()

        result['moonrise'] = {
            'time': rise_time_local.strftime('%H:%M'),
            'label': get_relative_label(rise_date, today_local),
            'date': rise_date.strftime('%Y-%m-%d'),
        }
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        pass

    # Reset observer to find moonset
    observer.date = ephem.Date(now_utc)

    # Find next moonset
    try:
        set_time_ephem = observer.next_setting(moon)
        set_time_utc = ephem.Date(set_time_ephem).datetime().replace(tzinfo=ZoneInfo('UTC'))
        set_time_local = set_time_utc.astimezone(local_tz)
        set_date = set_time_local.date()

        result['moonset'] = {
            'time': set_time_local.strftime('%H:%M'),
            'label': get_relative_label(set_date, today_local),
            'date': set_date.strftime('%Y-%m-%d'),
        }
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        pass

    return result


def get_phases_for_range(
    start_date: datetime,
    end_date: datetime,
    lat: Optional[float] = None,
    lng: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Calculate moon phases for a date range.

    Returns list of phase dictionaries, one per day in the range (inclusive).
    """
    phases = []
    current = start_date
    while current <= end_date:
        phases.append(get_phase_for_date(current, lat, lng))
        current += timedelta(days=1)
    return phases


def get_next_key_dates(from_date: datetime) -> Dict[str, str]:
    """
    Get the next occurrence of each key moon phase from the given date.

    Returns dictionary with next_new_moon, next_full_moon,
    next_first_quarter, and next_last_quarter dates.
    """
    date = ephem.Date(from_date)

    return {
        'next_new_moon': ephem.Date(ephem.next_new_moon(date)).datetime().strftime('%Y-%m-%d'),
        'next_full_moon': ephem.Date(ephem.next_full_moon(date)).datetime().strftime('%Y-%m-%d'),
        'next_first_quarter': ephem.Date(ephem.next_first_quarter_moon(date)).datetime().strftime('%Y-%m-%d'),
        'next_last_quarter': ephem.Date(ephem.next_last_quarter_moon(date)).datetime().strftime('%Y-%m-%d'),
    }


def get_key_dates_in_range(
    start_date: datetime,
    end_date: datetime
) -> List[Dict[str, Any]]:
    """
    Get all key phase dates (new, full, quarters) within a date range.

    Returns list of key phase events sorted by date.
    """
    key_dates = []
    date = ephem.Date(start_date)
    end = ephem.Date(end_date)

    # Define phase functions with their metadata
    phase_funcs = [
        (ephem.next_new_moon, 'New Moon', '🌑', 0.0),
        (ephem.next_first_quarter_moon, 'First Quarter', '🌓', 50.0),
        (ephem.next_full_moon, 'Full Moon', '🌕', 100.0),
        (ephem.next_last_quarter_moon, 'Last Quarter', '🌗', 50.0),
    ]

    for func, name, emoji, illumination in phase_funcs:
        current = date
        while True:
            next_date = func(current)
            if next_date > end:
                break
            key_dates.append({
                'date': ephem.Date(next_date).datetime().strftime('%Y-%m-%d'),
                'phase_name': name,
                'phase_emoji': emoji,
                'illumination': illumination,
            })
            current = next_date + 1  # Move past this date to find next occurrence

    # Sort by date
    key_dates.sort(key=lambda x: x['date'])
    return key_dates


def get_moon_data_unified(
    start_date: datetime,
    end_date: datetime,
    lat: Optional[float] = None,
    lng: Optional[float] = None
) -> Dict[str, Any]:
    """
    Get moon data in the unified astronomy API format.

    Returns a consistent response structure matching the weather API,
    enabling frontend code to handle both APIs uniformly.

    Args:
        start_date: Start of date range
        end_date: End of date range
        lat: Optional latitude for moonrise/moonset
        lng: Optional longitude for moonrise/moonset

    Returns:
        Unified response with:
        - location: {lat, lng} if coordinates provided
        - generated_at: ISO timestamp
        - current: Real-time phase data for NOW
        - daily: Array of daily phase data with data_type: "computed"
    """
    from datetime import timezone as tz

    now = datetime.now(tz.utc)

    # Build response
    response: Dict[str, Any] = {
        'generated_at': now.isoformat(),
        'current': {},
        'daily': [],
    }

    # Add location if provided
    if lat is not None and lng is not None:
        response['location'] = {
            'lat': round(float(lat), 2),
            'lng': round(float(lng), 2)
        }

    # Get current (NOW) moon data
    current_phase = get_phase_for_date(now, lat, lng)
    response['current'] = {
        'timestamp': now.isoformat(),
        'phase_name': current_phase.get('phase_name'),
        'phase_emoji': current_phase.get('phase_emoji'),
        'illumination': current_phase.get('illumination'),
        'phase_angle': current_phase.get('phase_angle'),
        'is_waning': current_phase.get('is_waning'),
        'is_good_for_stargazing': current_phase.get('is_good_for_stargazing'),
    }

    # Add moonrise/moonset to current if location provided
    if lat is not None and lng is not None:
        response['current']['next_moonrise'] = current_phase.get('next_moonrise')
        response['current']['next_moonset'] = current_phase.get('next_moonset')
        response['current']['rotation_angle'] = current_phase.get('rotation_angle')

    # Get daily phase data for the date range
    phases = get_phases_for_range(start_date, end_date, lat, lng)

    for phase in phases:
        daily_entry = {
            'date': phase.get('date'),
            'data_type': 'computed',
            'phase_name': phase.get('phase_name'),
            'phase_emoji': phase.get('phase_emoji'),
            'illumination': phase.get('illumination'),
            'phase_angle': phase.get('phase_angle'),
            'is_waning': phase.get('is_waning'),
            'is_good_for_stargazing': phase.get('is_good_for_stargazing'),
        }

        # Include rotation angle if location provided
        if lat is not None and lng is not None and 'rotation_angle' in phase:
            daily_entry['rotation_angle'] = phase.get('rotation_angle')

        response['daily'].append(daily_entry)

    return response
