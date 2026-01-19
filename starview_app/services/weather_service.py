# ----------------------------------------------------------------------------------------------------- #
# Weather Service for Stargazing Predictions                                                           #
#                                                                                                      #
# Purpose:                                                                                             #
# Aggregates weather data from multiple external APIs to provide comprehensive forecasts for           #
# astronomy/stargazing planning. Combines astronomy-specific data (seeing, transparency) with          #
# general weather metrics (cloud cover, humidity, wind).                                               #
#                                                                                                      #
# Data Sources:                                                                                        #
# - 7Timer (ASTRO product): Astronomy-specific forecasts from Chinese National Observatory             #
#   Provides: seeing (1-8), transparency (1-8), cloud cover, lifted index                              #
#   Coverage: Global, 3-day forecast, 3-hour intervals                                                 #
#                                                                                                      #
# - Open-Meteo: General weather forecasts from European weather models                                 #
#   Provides: Cloud layers (low/mid/high), visibility, humidity, wind, temperature                     #
#   Coverage: Global, up to 16-day forecast, hourly intervals                                          #
#   Note: All times are returned in the observer's local timezone using timezonefinder                 #
#                                                                                                      #
# Error Handling:                                                                                      #
# Both APIs are free with no API keys required. Service degrades gracefully when one API fails,        #
# returning partial data from the available source. Only returns 503 when both APIs fail.              #
#                                                                                                      #
# Caching:                                                                                             #
# Results are cached for 30 minutes at the view layer. Coordinates are rounded to 2 decimal            #
# places (~1km) to increase cache hit rate while maintaining accuracy for weather data.                #
# ----------------------------------------------------------------------------------------------------- #

from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

import requests
from timezonefinder import TimezoneFinder

# Singleton timezone finder (expensive to initialize)
_tf = None

def _get_timezone_finder():
    """Lazily initialize the TimezoneFinder singleton."""
    global _tf
    if _tf is None:
        _tf = TimezoneFinder()
    return _tf


class WeatherService:
    """Weather data aggregation service for astronomy applications."""

    # API Configuration
    SEVEN_TIMER_URL = "http://www.7timer.info/bin/api.pl"
    OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
    REQUEST_TIMEOUT = 10  # seconds

    # Historical data configuration
    HISTORICAL_YEARS = [2025, 2024, 2023, 2022, 2021]  # 5 years for averaging
    WINDOW_PADDING_DAYS = 5  # ±5 days when fetching historical averages
    FORECAST_MAX_DAYS = 16  # Open-Meteo forecast limit
    ARCHIVE_DELAY_DAYS = 5  # Open-Meteo archive has ~5 day delay

    # 7Timer seeing scale: value -> (arcseconds range, description)
    SEEING_SCALE = {
        1: ("<0.5\"", "Excellent"),
        2: ("0.5-0.75\"", "Excellent"),
        3: ("0.75-1.0\"", "Good"),
        4: ("1.0-1.25\"", "Good"),
        5: ("1.25-1.5\"", "Average"),
        6: ("1.5-2.0\"", "Poor"),
        7: ("2.0-2.5\"", "Bad"),
        8: (">2.5\"", "Terrible"),
    }

    # 7Timer transparency scale: value -> description
    TRANSPARENCY_SCALE = {
        1: "Very Poor",
        2: "Very Poor",
        3: "Poor",
        4: "Poor",
        5: "Average",
        6: "Good",
        7: "Excellent",
        8: "Excellent",
    }

    # 7Timer cloud cover scale: value (1-9) -> approximate percentage
    CLOUD_COVER_SCALE = {
        1: 3,    # 0-6%
        2: 12,   # 6-19%
        3: 25,   # 19-31%
        4: 37,   # 31-44%
        5: 50,   # 44-56%
        6: 62,   # 56-69%
        7: 75,   # 69-81%
        8: 87,   # 81-94%
        9: 97,   # 94-100%
    }

    # 7Timer wind speed scale: value -> km/h
    WIND_SPEED_SCALE = {
        1: 0.5,   # Below 0.3 m/s (calm)
        2: 3,     # 0.3-3.4 m/s (light)
        3: 9,     # 3.4-8.0 m/s (moderate)
        4: 15,    # 8.0-10.8 m/s (fresh)
        5: 21,    # 10.8-17.2 m/s (strong)
        6: 30,    # 17.2-24.5 m/s (gale)
        7: 43,    # 24.5-32.6 m/s (severe gale)
        8: 60,    # Over 32.6 m/s (storm)
    }

    # Wind direction mapping
    WIND_DIRECTIONS = {
        "N": "N", "NE": "NE", "E": "E", "SE": "SE",
        "S": "S", "SW": "SW", "W": "W", "NW": "NW"
    }



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                       HELPER METHODS                                              #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _make_request(url: str) -> Optional[dict]:
        """
        Make HTTP request with consistent error handling.

        Returns None on any failure to enable graceful degradation.
        The calling method decides how to handle missing data.
        """
        try:
            response = requests.get(url, timeout=WeatherService.REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout:
            # Weather API timeout - will use other source if available
            return None

        except requests.exceptions.HTTPError:
            # Weather API HTTP error - will use other source if available
            return None

        except requests.exceptions.RequestException:
            # Weather API request failed - will use other source if available
            return None

        except ValueError:
            # Invalid JSON from weather API - will use other source if available
            return None


    @staticmethod
    def _round_coordinates(lat: float, lng: float) -> tuple:
        """Round coordinates to 2 decimal places (~1km) for cache efficiency."""
        return round(float(lat), 2), round(float(lng), 2)

    @staticmethod
    def _get_timezone_for_location(lat: float, lng: float) -> str:
        """
        Get the IANA timezone name for a location using TimezoneFinder.

        Returns timezone string (e.g., 'America/Denver') or 'UTC' as fallback.
        This ensures all weather times are in the observer's local timezone.
        """
        tf = _get_timezone_finder()
        tz_name = tf.timezone_at(lat=lat, lng=lng)
        return tz_name if tz_name else 'UTC'


    @staticmethod
    def _get_seeing_description(value: int) -> tuple:
        """Convert 7Timer seeing value to human-readable description."""
        if value in WeatherService.SEEING_SCALE:
            return WeatherService.SEEING_SCALE[value]
        return ("Unknown", "Unknown")


    @staticmethod
    def _get_transparency_description(value: int) -> str:
        """Convert 7Timer transparency value to human-readable description."""
        return WeatherService.TRANSPARENCY_SCALE.get(value, "Unknown")


    @staticmethod
    def _convert_cloud_cover(value: int) -> int:
        """Convert 7Timer cloud cover (1-9) to percentage (0-100)."""
        return WeatherService.CLOUD_COVER_SCALE.get(value, 50)


    @staticmethod
    def _convert_wind_speed(value: int) -> float:
        """Convert 7Timer wind speed value to km/h."""
        return WeatherService.WIND_SPEED_SCALE.get(value, 10)



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                    7TIMER API METHODS                                             #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _normalize_seven_timer_response(data: dict) -> Optional[dict]:
        """
        Transform 7Timer ASTRO API response to normalized format.

        7Timer returns a 'dataseries' array with 3-hour interval forecasts.
        Each entry contains: timepoint, cloudcover, seeing, transparency,
        lifted_index, rh2m, wind10m, temp2m, prec_type.
        """
        if not data or 'dataseries' not in data:
            return None

        try:
            dataseries = data['dataseries']
            if not dataseries:
                return None

            # Get current conditions from first entry
            current = dataseries[0]

            # Extract seeing info
            seeing_value = current.get('seeing')
            seeing_arcsec, seeing_desc = WeatherService._get_seeing_description(seeing_value)

            # Extract transparency info
            transparency_value = current.get('transparency')
            transparency_desc = WeatherService._get_transparency_description(transparency_value)

            # Extract wind info
            wind_data = current.get('wind10m', {})
            wind_speed = WeatherService._convert_wind_speed(wind_data.get('speed', 1))
            wind_direction = wind_data.get('direction', 'N')

            normalized = {
                'current': {
                    'cloud_cover': WeatherService._convert_cloud_cover(current.get('cloudcover', 5)),
                    'seeing': seeing_value,
                    'seeing_arcsec': seeing_arcsec,
                    'seeing_desc': seeing_desc,
                    'transparency': transparency_value,
                    'transparency_desc': transparency_desc,
                    'lifted_index': current.get('lifted_index'),
                    'humidity': current.get('rh2m'),
                    'wind_speed': wind_speed,
                    'wind_direction': wind_direction,
                    'temperature': current.get('temp2m'),
                    'precipitation_type': current.get('prec_type', 'none'),
                },
                'hourly': []
            }

            # Process hourly forecast (3-hour intervals from 7Timer)
            for entry in dataseries:
                seeing_val = entry.get('seeing')
                seeing_arc, _ = WeatherService._get_seeing_description(seeing_val)
                wind_data = entry.get('wind10m', {})

                normalized['hourly'].append({
                    'timepoint': entry.get('timepoint'),  # Hours from init time
                    'cloud_cover': WeatherService._convert_cloud_cover(entry.get('cloudcover', 5)),
                    'seeing': seeing_val,
                    'seeing_arcsec': seeing_arc,
                    'transparency': entry.get('transparency'),
                    'humidity': entry.get('rh2m'),
                    'wind_speed': WeatherService._convert_wind_speed(wind_data.get('speed', 1)),
                    'temperature': entry.get('temp2m'),
                    'precipitation_type': entry.get('prec_type', 'none'),
                })

            return normalized

        except (KeyError, TypeError, IndexError):
            return None


    @staticmethod
    def fetch_seven_timer_forecast(lat: float, lng: float) -> Optional[dict]:
        """
        Fetch astronomy-specific forecast from 7Timer ASTRO product.

        Returns 3-day forecast with seeing, transparency, and cloud cover
        data specifically designed for astronomical observation planning.
        """
        rounded_lat, rounded_lng = WeatherService._round_coordinates(lat, lng)

        url = (
            f"{WeatherService.SEVEN_TIMER_URL}"
            f"?lon={rounded_lng}&lat={rounded_lat}"
            f"&product=astro&output=json"
        )

        data = WeatherService._make_request(url)
        if not data:
            return None

        return WeatherService._normalize_seven_timer_response(data)



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                   OPEN-METEO API METHODS                                          #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _normalize_open_meteo_response(data: dict, timezone_str: str = 'UTC') -> Optional[dict]:
        """
        Transform Open-Meteo API response to normalized format.

        Open-Meteo returns hourly arrays for each requested variable.
        When available, uses real-time 'current' data for current conditions.
        Falls back to closest hourly entry if current data unavailable.

        Args:
            data: Raw Open-Meteo API response
            timezone_str: IANA timezone name for the location (e.g., 'America/Denver')
                         Used to correctly identify current hour in local time
        """
        if not data or 'hourly' not in data:
            return None

        try:
            import pytz
            hourly = data['hourly']
            times = hourly.get('time', [])

            if not times:
                return None

            # Check for real-time current data (preferred)
            current_data = data.get('current', {})
            has_current = bool(current_data)

            # Find the hourly entry closest to current time (fallback)
            # Use the observer's local timezone for comparison since Open-Meteo
            # returns times in that timezone
            try:
                tz = pytz.timezone(timezone_str)
                now = datetime.now(tz).replace(tzinfo=None)  # Naive local time
            except (pytz.UnknownTimeZoneError, Exception):
                now = datetime.now()  # Fallback to server time

            current_idx = 0
            for i, time_str in enumerate(times):
                try:
                    entry_time = datetime.fromisoformat(time_str)
                    if entry_time <= now:
                        current_idx = i
                    else:
                        break
                except ValueError:
                    continue

            # Helper to get value from current (real-time) or hourly (fallback)
            def get_current_value(current_key, hourly_key):
                if has_current and current_key in current_data:
                    return current_data[current_key]
                hourly_list = hourly.get(hourly_key, [])
                if current_idx < len(hourly_list):
                    return hourly_list[current_idx]
                return None

            # Get current conditions - prefer real-time data
            normalized = {
                'current': {
                    'cloud_cover': get_current_value('cloud_cover', 'cloud_cover'),
                    'cloud_cover_low': hourly.get('cloud_cover_low', [None])[current_idx] if current_idx < len(hourly.get('cloud_cover_low', [])) else None,
                    'cloud_cover_mid': hourly.get('cloud_cover_mid', [None])[current_idx] if current_idx < len(hourly.get('cloud_cover_mid', [])) else None,
                    'cloud_cover_high': hourly.get('cloud_cover_high', [None])[current_idx] if current_idx < len(hourly.get('cloud_cover_high', [])) else None,
                    'visibility': hourly.get('visibility', [None])[current_idx] if current_idx < len(hourly.get('visibility', [])) else None,
                    'humidity': get_current_value('relative_humidity_2m', 'relative_humidity_2m'),
                    'wind_speed': get_current_value('wind_speed_10m', 'wind_speed_10m'),
                    'temperature': get_current_value('temperature_2m', 'temperature_2m'),
                    'precipitation_probability': hourly.get('precipitation_probability', [None])[current_idx] if current_idx < len(hourly.get('precipitation_probability', [])) else None,
                },
                'hourly': []
            }

            # Process hourly forecast
            for i, time_str in enumerate(times):
                normalized['hourly'].append({
                    'time': time_str,
                    'cloud_cover': hourly.get('cloud_cover', [])[i] if i < len(hourly.get('cloud_cover', [])) else None,
                    'cloud_cover_low': hourly.get('cloud_cover_low', [])[i] if i < len(hourly.get('cloud_cover_low', [])) else None,
                    'cloud_cover_mid': hourly.get('cloud_cover_mid', [])[i] if i < len(hourly.get('cloud_cover_mid', [])) else None,
                    'cloud_cover_high': hourly.get('cloud_cover_high', [])[i] if i < len(hourly.get('cloud_cover_high', [])) else None,
                    'visibility': hourly.get('visibility', [])[i] if i < len(hourly.get('visibility', [])) else None,
                    'humidity': hourly.get('relative_humidity_2m', [])[i] if i < len(hourly.get('relative_humidity_2m', [])) else None,
                    'wind_speed': hourly.get('wind_speed_10m', [])[i] if i < len(hourly.get('wind_speed_10m', [])) else None,
                    'temperature': hourly.get('temperature_2m', [])[i] if i < len(hourly.get('temperature_2m', [])) else None,
                    'precipitation_probability': hourly.get('precipitation_probability', [])[i] if i < len(hourly.get('precipitation_probability', [])) else None,
                })

            return normalized

        except (KeyError, TypeError, IndexError):
            return None


    @staticmethod
    def fetch_open_meteo_forecast(lat: float, lng: float, days: int = 3) -> Optional[dict]:
        """
        Fetch general weather forecast from Open-Meteo.

        Returns up to 16-day hourly forecast with cloud layers,
        visibility, humidity, wind, temperature, and precipitation.
        Also requests real-time current conditions for accuracy.

        All times are returned in the observer's local timezone.
        """
        rounded_lat, rounded_lng = WeatherService._round_coordinates(lat, lng)
        timezone_str = WeatherService._get_timezone_for_location(lat, lng)

        # Build hourly variables list
        hourly_vars = ",".join([
            "cloud_cover",
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high",
            "visibility",
            "relative_humidity_2m",
            "wind_speed_10m",
            "temperature_2m",
            "precipitation_probability"
        ])

        # Build current variables list (real-time data)
        current_vars = ",".join([
            "cloud_cover",
            "relative_humidity_2m",
            "wind_speed_10m",
            "temperature_2m"
        ])

        url = (
            f"{WeatherService.OPEN_METEO_URL}"
            f"?latitude={rounded_lat}&longitude={rounded_lng}"
            f"&hourly={hourly_vars}"
            f"&current={current_vars}"
            f"&forecast_days={days}"
            f"&timezone={timezone_str}"
        )

        data = WeatherService._make_request(url)
        if not data:
            return None

        return WeatherService._normalize_open_meteo_response(data, timezone_str)



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                    DATA MERGING METHODS                                           #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _merge_weather_data(
        seven_timer: Optional[dict],
        open_meteo: Optional[dict],
        lat: float,
        lng: float
    ) -> dict:
        """
        Merge data from both sources with smart prioritization.

        Priority rules:
        - Seeing/Transparency: 7Timer only (astronomy-specific)
        - Cloud layers (low/mid/high): Open-Meteo only
        - Total cloud cover: 7Timer preferred (astronomy context)
        - Visibility: Open-Meteo only
        - Temperature/Wind: Open-Meteo preferred (more frequent updates)
        - Humidity: Open-Meteo preferred
        """
        result = {
            'location': {
                'lat': round(float(lat), 2),
                'lng': round(float(lng), 2)
            },
            'forecast_generated': datetime.now(timezone.utc).isoformat(),
            'sources': {
                'seven_timer': seven_timer is not None,
                'open_meteo': open_meteo is not None
            },
            'current_conditions': {},
            'hourly_forecast': []
        }

        # Merge current conditions
        current = result['current_conditions']

        # Astronomy-specific data (7Timer only)
        if seven_timer and 'current' in seven_timer:
            st_current = seven_timer['current']
            current['seeing'] = st_current.get('seeing')
            current['seeing_arcsec'] = st_current.get('seeing_arcsec')
            current['seeing_desc'] = st_current.get('seeing_desc')
            current['transparency'] = st_current.get('transparency')
            current['transparency_desc'] = st_current.get('transparency_desc')
            current['lifted_index'] = st_current.get('lifted_index')
            current['precipitation_type'] = st_current.get('precipitation_type')

            # Cloud cover from 7Timer (astronomy context)
            current['cloud_cover'] = st_current.get('cloud_cover')
        else:
            current['seeing'] = None
            current['seeing_arcsec'] = None
            current['seeing_desc'] = None
            current['transparency'] = None
            current['transparency_desc'] = None
            current['lifted_index'] = None
            current['precipitation_type'] = None

        # Cloud layer data (Open-Meteo only)
        if open_meteo and 'current' in open_meteo:
            om_current = open_meteo['current']
            current['cloud_cover_low'] = om_current.get('cloud_cover_low')
            current['cloud_cover_mid'] = om_current.get('cloud_cover_mid')
            current['cloud_cover_high'] = om_current.get('cloud_cover_high')
            current['visibility'] = om_current.get('visibility')
            current['precipitation_probability'] = om_current.get('precipitation_probability')

            # Use Open-Meteo for general weather if 7Timer unavailable
            if current.get('cloud_cover') is None:
                current['cloud_cover'] = om_current.get('cloud_cover')

            # Prefer Open-Meteo for frequently-updated metrics
            current['humidity'] = om_current.get('humidity')
            current['wind_speed'] = om_current.get('wind_speed')
            current['temperature'] = om_current.get('temperature')
        else:
            current['cloud_cover_low'] = None
            current['cloud_cover_mid'] = None
            current['cloud_cover_high'] = None
            current['visibility'] = None
            current['precipitation_probability'] = None

            # Fall back to 7Timer if Open-Meteo unavailable
            if seven_timer and 'current' in seven_timer:
                st_current = seven_timer['current']
                current['humidity'] = st_current.get('humidity')
                current['wind_speed'] = st_current.get('wind_speed')
                current['wind_direction'] = st_current.get('wind_direction')
                current['temperature'] = st_current.get('temperature')
            else:
                current['humidity'] = None
                current['wind_speed'] = None
                current['temperature'] = None

        # Build hourly forecast (prefer Open-Meteo for hourly granularity)
        if open_meteo and 'hourly' in open_meteo:
            # Create a lookup for 7Timer data by approximate hour
            seven_timer_lookup = {}
            if seven_timer and 'hourly' in seven_timer:
                for entry in seven_timer['hourly']:
                    # 7Timer uses timepoint (hours from init), convert to index
                    tp = entry.get('timepoint', 0)
                    seven_timer_lookup[tp] = entry

            for i, om_entry in enumerate(open_meteo['hourly']):
                # Try to match with 7Timer data (every 3 hours)
                # 7Timer timepoints are 3, 6, 9, 12, etc.
                nearest_tp = ((i // 3) + 1) * 3
                st_entry = seven_timer_lookup.get(nearest_tp, {})

                hourly_entry = {
                    'time': om_entry.get('time'),
                    'cloud_cover': om_entry.get('cloud_cover'),
                    'cloud_cover_low': om_entry.get('cloud_cover_low'),
                    'cloud_cover_mid': om_entry.get('cloud_cover_mid'),
                    'cloud_cover_high': om_entry.get('cloud_cover_high'),
                    'visibility': om_entry.get('visibility'),
                    'humidity': om_entry.get('humidity'),
                    'wind_speed': om_entry.get('wind_speed'),
                    'temperature': om_entry.get('temperature'),
                    'precipitation_probability': om_entry.get('precipitation_probability'),
                    # 7Timer astronomy data (may be None if not available)
                    'seeing': st_entry.get('seeing'),
                    'transparency': st_entry.get('transparency'),
                }
                result['hourly_forecast'].append(hourly_entry)

        elif seven_timer and 'hourly' in seven_timer:
            # Only 7Timer available - use its 3-hour interval data
            for entry in seven_timer['hourly']:
                hourly_entry = {
                    'timepoint_hours': entry.get('timepoint'),
                    'cloud_cover': entry.get('cloud_cover'),
                    'humidity': entry.get('humidity'),
                    'wind_speed': entry.get('wind_speed'),
                    'temperature': entry.get('temperature'),
                    'seeing': entry.get('seeing'),
                    'transparency': entry.get('transparency'),
                    'precipitation_type': entry.get('precipitation_type'),
                }
                result['hourly_forecast'].append(hourly_entry)

        return result



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                    MAIN SERVICE METHOD                                            #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def get_weather_forecast(lat: float, lng: float, days: int = 3) -> dict:
        """
        Get combined weather forecast from all available sources.

        Fetches from both 7Timer and Open-Meteo, merges the data with
        smart prioritization, and returns a unified response.

        Args:
            lat: Latitude (-90 to 90)
            lng: Longitude (-180 to 180)
            days: Forecast days (1-7, default 3)

        Returns:
            Normalized weather data with source indicators.
            Partial data if one API fails, error response if both fail.
        """
        # Fetch from both APIs
        seven_timer_data = WeatherService.fetch_seven_timer_forecast(lat, lng)
        open_meteo_data = WeatherService.fetch_open_meteo_forecast(lat, lng, days)

        # Merge and return
        return WeatherService._merge_weather_data(
            seven_timer_data,
            open_meteo_data,
            lat,
            lng
        )



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                    UNIFIED API METHODS                                            #
    #                                                                                                   #
    # These methods support the unified astronomy API contract with date ranges,                        #
    # automatic data source selection (forecast vs historical vs historical average),                   #
    # and consistent response structure.                                                                #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def classify_date(target_date: date, reference_today: date = None) -> str:
        """
        Classify a date to determine which data source to use.

        Args:
            target_date: The date to classify
            reference_today: The reference "today" date (defaults to date.today())
                             Should be the local date for the queried location.

        Returns:
            'forecast': Today to +16 days (use forecast APIs)
            'historical': Past dates beyond archive delay (use archive API)
            'historical_average': >16 days in future (average past years)
        """
        today = reference_today if reference_today else date.today()
        days_away = (target_date - today).days

        if days_away < -WeatherService.ARCHIVE_DELAY_DAYS:
            # Past date (with buffer for archive delay)
            return "historical"
        elif days_away <= WeatherService.FORECAST_MAX_DAYS:
            # Today to +16 days - use forecast
            return "forecast"
        else:
            # Far future - use historical averages
            return "historical_average"


    @staticmethod
    def fetch_open_meteo_historical(
        lat: float,
        lng: float,
        start_date: date,
        end_date: date
    ) -> Optional[dict]:
        """
        Fetch historical weather from Open-Meteo Archive API.

        Returns past weather data (actual recorded weather).
        Archive has ~5 day delay from present.

        All times are returned in the observer's local timezone.

        Args:
            lat: Latitude
            lng: Longitude
            start_date: Start date for historical data
            end_date: End date for historical data

        Returns:
            Normalized weather data or None if request fails
        """
        rounded_lat, rounded_lng = WeatherService._round_coordinates(lat, lng)
        timezone_str = WeatherService._get_timezone_for_location(lat, lng)

        hourly_vars = ",".join([
            "cloud_cover",
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high",
            "visibility",
            "relative_humidity_2m",
            "wind_speed_10m",
            "temperature_2m"
        ])

        url = (
            f"{WeatherService.OPEN_METEO_ARCHIVE_URL}"
            f"?latitude={rounded_lat}&longitude={rounded_lng}"
            f"&start_date={start_date.isoformat()}"
            f"&end_date={end_date.isoformat()}"
            f"&hourly={hourly_vars}"
            f"&timezone={timezone_str}"
        )

        data = WeatherService._make_request(url)
        if not data:
            return None

        return WeatherService._normalize_open_meteo_response(data, timezone_str)


    @staticmethod
    def get_historical_average(
        lat: float,
        lng: float,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """
        Compute historical averages for a date range from past 5 years.

        For dates >16 days in the future, we can't get forecasts.
        Instead, we fetch the same month/day from past years and average.

        Applies window padding (±5 days) to improve cache efficiency.

        Args:
            lat: Latitude
            lng: Longitude
            start_date: Start date for averages
            end_date: End date for averages

        Returns:
            Dict with 'hourly' containing averaged data per date
        """
        # Apply window padding for better caching
        padded_start = start_date - timedelta(days=WeatherService.WINDOW_PADDING_DAYS)
        padded_end = end_date + timedelta(days=WeatherService.WINDOW_PADDING_DAYS)

        # Collect data from each historical year
        all_years_data: List[dict] = []

        for year in WeatherService.HISTORICAL_YEARS:
            try:
                # Adjust dates to the historical year
                hist_start = padded_start.replace(year=year)
                hist_end = padded_end.replace(year=year)
            except ValueError:
                # Handle Feb 29 in non-leap years
                # Adjust to Feb 28 if necessary
                try:
                    hist_start = padded_start.replace(year=year, day=min(padded_start.day, 28))
                    hist_end = padded_end.replace(year=year, day=min(padded_end.day, 28))
                except ValueError:
                    continue

            historical_data = WeatherService.fetch_open_meteo_historical(
                lat, lng, hist_start, hist_end
            )

            if historical_data and 'hourly' in historical_data:
                all_years_data.append(historical_data)

        if not all_years_data:
            return {'hourly': [], 'years_averaged': 0}

        # Average the data across years
        return WeatherService._average_historical_data(all_years_data, start_date, end_date)


    @staticmethod
    def _average_historical_data(
        all_years_data: List[dict],
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """
        Average hourly weather data across multiple years.

        Groups data by month-day-hour, then computes mean for each field.

        Args:
            all_years_data: List of normalized weather responses from different years
            start_date: Original requested start date
            end_date: Original requested end date

        Returns:
            Dict with averaged 'hourly' data and metadata
        """
        from collections import defaultdict

        # Group data by month-day-hour key
        hourly_buckets = defaultdict(list)

        for year_data in all_years_data:
            for entry in year_data.get('hourly', []):
                time_str = entry.get('time', '')
                if not time_str:
                    continue

                try:
                    # Parse timestamp to get month-day-hour
                    dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    key = (dt.month, dt.day, dt.hour)
                    hourly_buckets[key].append(entry)
                except (ValueError, AttributeError):
                    continue

        # Compute averages for each bucket
        averaged_hourly = []

        # Generate time slots for the requested date range
        current_date = start_date
        while current_date <= end_date:
            for hour in range(24):
                key = (current_date.month, current_date.day, hour)
                entries = hourly_buckets.get(key, [])

                if not entries:
                    continue

                # Average numeric fields
                avg_entry = {
                    'time': f"{current_date.isoformat()}T{hour:02d}:00",
                    'cloud_cover': WeatherService._safe_avg([e.get('cloud_cover') for e in entries]),
                    'cloud_cover_low': WeatherService._safe_avg([e.get('cloud_cover_low') for e in entries]),
                    'cloud_cover_mid': WeatherService._safe_avg([e.get('cloud_cover_mid') for e in entries]),
                    'cloud_cover_high': WeatherService._safe_avg([e.get('cloud_cover_high') for e in entries]),
                    'visibility': WeatherService._safe_avg([e.get('visibility') for e in entries]),
                    'humidity': WeatherService._safe_avg([e.get('humidity') for e in entries]),
                    'wind_speed': WeatherService._safe_avg([e.get('wind_speed') for e in entries]),
                    'temperature': WeatherService._safe_avg([e.get('temperature') for e in entries]),
                    'precipitation_probability': None,  # Not available in historical
                    'seeing': None,  # 7Timer data not available for historical
                    'transparency': None,
                }
                averaged_hourly.append(avg_entry)

            current_date += timedelta(days=1)

        return {
            'hourly': averaged_hourly,
            'years_averaged': len(all_years_data),
            'confidence': 'high' if len(all_years_data) >= 5 else ('medium' if len(all_years_data) >= 3 else 'low')
        }


    @staticmethod
    def _safe_avg(values: List) -> Optional[float]:
        """Compute average of numeric values, ignoring None."""
        valid = [v for v in values if v is not None]
        if not valid:
            return None
        return round(sum(valid) / len(valid), 1)


    @staticmethod
    def summarize_daily(hourly_data: List[dict], target_date: date) -> Dict[str, Any]:
        """
        Compute daily summary statistics from hourly data.

        Args:
            hourly_data: List of hourly weather entries
            target_date: The date to summarize

        Returns:
            Dict with summary statistics (averages, highs, lows)
        """
        date_str = target_date.isoformat()

        # Filter to entries for this date
        day_entries = [
            e for e in hourly_data
            if e.get('time', '').startswith(date_str)
        ]

        if not day_entries:
            return {}

        # Extract values
        cloud_covers = [e.get('cloud_cover') for e in day_entries if e.get('cloud_cover') is not None]
        temperatures = [e.get('temperature') for e in day_entries if e.get('temperature') is not None]
        humidities = [e.get('humidity') for e in day_entries if e.get('humidity') is not None]
        wind_speeds = [e.get('wind_speed') for e in day_entries if e.get('wind_speed') is not None]
        precip_probs = [e.get('precipitation_probability') for e in day_entries if e.get('precipitation_probability') is not None]

        summary = {}

        if cloud_covers:
            summary['cloud_cover_avg'] = round(sum(cloud_covers) / len(cloud_covers), 1)

        if temperatures:
            summary['temperature_high'] = round(max(temperatures), 1)
            summary['temperature_low'] = round(min(temperatures), 1)

        if humidities:
            summary['humidity_avg'] = round(sum(humidities) / len(humidities), 1)

        if wind_speeds:
            summary['wind_speed_max'] = round(max(wind_speeds), 1)

        if precip_probs:
            summary['precipitation_probability_max'] = round(max(precip_probs), 1)

        return summary


    @staticmethod
    def get_weather_for_range(
        lat: float,
        lng: float,
        start_date: date,
        end_date: date,
        reference_today: date = None
    ) -> Dict[str, Any]:
        """
        Get weather data for a date range with automatic source selection.

        Main entry point for the unified API. Routes each date to the
        appropriate data source (forecast, historical, or historical average)
        and returns a consistent response structure.

        Args:
            lat: Latitude (-90 to 90)
            lng: Longitude (-180 to 180)
            start_date: Start of date range
            end_date: End of date range
            reference_today: The reference "today" date for the location's timezone.
                             Defaults to date.today() if not provided.

        Returns:
            Unified weather response with 'current', 'daily', and metadata
        """
        local_today = reference_today if reference_today else date.today()
        rounded_lat = round(float(lat), 1)
        rounded_lng = round(float(lng), 1)

        # Always get current conditions (real-time from forecast API)
        seven_timer_now = WeatherService.fetch_seven_timer_forecast(lat, lng)
        open_meteo_now = WeatherService.fetch_open_meteo_forecast(lat, lng, days=1)

        # Build current conditions from merged data
        current_merged = WeatherService._merge_weather_data(
            seven_timer_now, open_meteo_now, lat, lng
        )

        # Initialize response
        response = {
            'location': {'lat': rounded_lat, 'lng': rounded_lng},
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'current': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                **current_merged.get('current_conditions', {})
            },
            'daily': [],
            'sources': current_merged.get('sources', {}),
            'warnings': []
        }

        # Group dates by classification
        forecast_dates = []
        historical_dates = []
        hist_avg_dates = []

        current_date = start_date
        while current_date <= end_date:
            classification = WeatherService.classify_date(current_date, local_today)
            if classification == 'forecast':
                forecast_dates.append(current_date)
            elif classification == 'historical':
                historical_dates.append(current_date)
            else:
                hist_avg_dates.append(current_date)
            current_date += timedelta(days=1)

        # Fetch forecast data (if any forecast dates)
        forecast_hourly = {}
        if forecast_dates:
            days_needed = (max(forecast_dates) - local_today).days + 1
            days_needed = min(days_needed, WeatherService.FORECAST_MAX_DAYS)

            seven_timer_data = WeatherService.fetch_seven_timer_forecast(lat, lng)
            open_meteo_data = WeatherService.fetch_open_meteo_forecast(lat, lng, days_needed)
            merged = WeatherService._merge_weather_data(seven_timer_data, open_meteo_data, lat, lng)

            for entry in merged.get('hourly_forecast', []):
                time_str = entry.get('time', '')
                if time_str:
                    date_key = time_str[:10]  # YYYY-MM-DD
                    if date_key not in forecast_hourly:
                        forecast_hourly[date_key] = []
                    forecast_hourly[date_key].append(entry)

        # Fetch historical data (if any historical dates)
        historical_hourly = {}
        if historical_dates:
            hist_start = min(historical_dates)
            hist_end = max(historical_dates)
            historical_data = WeatherService.fetch_open_meteo_historical(lat, lng, hist_start, hist_end)

            if historical_data:
                for entry in historical_data.get('hourly', []):
                    time_str = entry.get('time', '')
                    if time_str:
                        date_key = time_str[:10]
                        if date_key not in historical_hourly:
                            historical_hourly[date_key] = []
                        historical_hourly[date_key].append(entry)

        # Fetch historical averages (if any hist_avg dates)
        hist_avg_data = {}
        years_averaged = 0
        confidence = 'high'
        if hist_avg_dates:
            avg_start = min(hist_avg_dates)
            avg_end = max(hist_avg_dates)
            avg_result = WeatherService.get_historical_average(lat, lng, avg_start, avg_end)
            years_averaged = avg_result.get('years_averaged', 0)
            confidence = avg_result.get('confidence', 'low')

            for entry in avg_result.get('hourly', []):
                time_str = entry.get('time', '')
                if time_str:
                    date_key = time_str[:10]
                    if date_key not in hist_avg_data:
                        hist_avg_data[date_key] = []
                    hist_avg_data[date_key].append(entry)

        # Build daily array
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.isoformat()
            classification = WeatherService.classify_date(current_date, local_today)

            daily_entry = {
                'date': date_str,
                'data_type': classification,
            }

            if classification == 'forecast':
                hourly = forecast_hourly.get(date_str, [])
                daily_entry['hourly'] = hourly
                daily_entry['summary'] = WeatherService.summarize_daily(hourly, current_date)
                daily_entry['confidence'] = 'high'
            elif classification == 'historical':
                hourly = historical_hourly.get(date_str, [])
                daily_entry['hourly'] = hourly
                daily_entry['summary'] = WeatherService.summarize_daily(hourly, current_date)
                daily_entry['confidence'] = 'high'
            else:  # historical_average
                hourly = hist_avg_data.get(date_str, [])
                daily_entry['hourly'] = hourly
                daily_entry['summary'] = WeatherService.summarize_daily(hourly, current_date)
                daily_entry['years_averaged'] = years_averaged
                daily_entry['confidence'] = confidence

            response['daily'].append(daily_entry)
            current_date += timedelta(days=1)

        # Add warnings if needed
        if hist_avg_dates and years_averaged < 5:
            response['warnings'].append({
                'type': 'reduced_confidence',
                'message': f'Historical averages based on {years_averaged} year(s) instead of 5',
                'affected_dates': [d.isoformat() for d in hist_avg_dates]
            })

        return response
