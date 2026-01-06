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
# ----------------------------------------------------------------------------------------------------- #

import ephem
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

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
    """
    observer = ephem.Observer()
    observer.date = ephem.Date(date)

    # Set location if provided (for moonrise/moonset calculations)
    if lat is not None and lng is not None:
        observer.lat = str(lat)
        observer.lon = str(lng)

    moon = ephem.Moon()
    moon.compute(observer)

    # Get illumination percentage (0-100)
    illumination = round(moon.phase, 1)

    # Get phase angle (ephem.phase is 0-100, convert to degrees 0-360)
    phase_angle = round(float(moon.phase) * 3.6, 1)

    # Determine phase name based on illumination and trend
    phase_key = _determine_phase(date, illumination)
    phase_info = PHASE_DATA[phase_key]

    result = {
        'date': date.strftime('%Y-%m-%d'),
        'phase_name': phase_info['name'],
        'phase_emoji': phase_info['emoji'],
        'illumination': illumination,
        'phase_angle': phase_angle,
        'is_good_for_stargazing': illumination < STARGAZING_THRESHOLD,
    }

    # Add moonrise/moonset if location provided
    if lat is not None and lng is not None:
        result['moonrise'] = _get_moonrise(observer, moon)
        result['moonset'] = _get_moonset(observer, moon)

    return result


def _determine_phase(date: datetime, illumination: float) -> str:
    """
    Determine the phase name based on illumination and whether waxing/waning.

    Compares today's illumination with tomorrow's to determine if the moon
    is waxing (getting brighter) or waning (getting dimmer).
    """
    # Check if waxing (illumination increasing) or waning
    tomorrow = date + timedelta(days=1)
    observer_tomorrow = ephem.Observer()
    observer_tomorrow.date = ephem.Date(tomorrow)
    moon_tomorrow = ephem.Moon()
    moon_tomorrow.compute(observer_tomorrow)
    tomorrow_illumination = moon_tomorrow.phase

    is_waxing = tomorrow_illumination > illumination

    # Determine phase based on illumination percentage and trend
    if illumination < 1:
        return 'new_moon'
    elif illumination > 99:
        return 'full_moon'
    elif 49 < illumination < 51:
        return 'first_quarter' if is_waxing else 'last_quarter'
    elif illumination < 50:
        return 'waxing_crescent' if is_waxing else 'waning_crescent'
    else:  # illumination > 50
        return 'waxing_gibbous' if is_waxing else 'waning_gibbous'


def _get_moonrise(observer: ephem.Observer, moon: ephem.Moon) -> Optional[str]:
    """Get moonrise time for the observer's date and location."""
    try:
        rise_time = observer.next_rising(moon)
        return ephem.Date(rise_time).datetime().strftime('%H:%M')
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        # Moon doesn't rise/set at extreme latitudes during certain periods
        return None


def _get_moonset(observer: ephem.Observer, moon: ephem.Moon) -> Optional[str]:
    """Get moonset time for the observer's date and location."""
    try:
        set_time = observer.next_setting(moon)
        return ephem.Date(set_time).datetime().strftime('%H:%M')
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        return None


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
