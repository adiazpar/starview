# ----------------------------------------------------------------------------------------------------- #
# Weather Service for Stargazing Predictions                                                           #
#                                                                                                      #
# Purpose:                                                                                             #
# Fetches weather data from Open-Meteo API for astronomy/stargazing planning. Provides cloud cover,   #
# cloud layers (low/mid/high), visibility, humidity, wind, and temperature data.                      #
#                                                                                                      #
# Data Source:                                                                                         #
# - Open-Meteo: General weather forecasts from European weather models                                 #
#   Provides: Cloud layers (low/mid/high), visibility, humidity, wind, temperature                     #
#   Coverage: Global, up to 16-day forecast, hourly intervals                                          #
#   Archive: Historical weather data from 1940 to present                                              #
#   Note: All times are returned in the observer's local timezone using timezonefinder                 #
#                                                                                                      #
# Caching:                                                                                             #
# Results are cached for 30 minutes at the view layer. Coordinates are rounded to 1 decimal           #
# place (~11km) for cache keys to balance accuracy with cache efficiency.                             #
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
    """Weather data service for astronomy applications using Open-Meteo."""

    # API Configuration
    OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
    REQUEST_TIMEOUT = 10  # seconds

    # Historical data configuration
    HISTORICAL_YEARS = [2025, 2024, 2023, 2022, 2021]  # 5 years for averaging
    WINDOW_PADDING_DAYS = 5  # ±5 days when fetching historical averages
    FORECAST_MAX_DAYS = 16  # Open-Meteo forecast limit
    ARCHIVE_DELAY_DAYS = 5  # Open-Meteo archive has ~5 day delay


    # ------------------------------------------------------------------------------------------------- #
    #                                       HELPER METHODS                                              #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _make_request(url: str) -> Optional[dict]:
        """
        Make HTTP request with consistent error handling.
        Returns None on any failure to enable graceful degradation.
        """
        try:
            response = requests.get(url, timeout=WeatherService.REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except (requests.exceptions.RequestException, ValueError):
            return None

    @staticmethod
    def _round_coordinates(lat: float, lng: float) -> tuple:
        """Round coordinates to 2 decimal places (~1km) for API calls."""
        return round(float(lat), 2), round(float(lng), 2)

    @staticmethod
    def _get_timezone_for_location(lat: float, lng: float) -> str:
        """
        Get the IANA timezone name for a location using TimezoneFinder.
        Returns timezone string (e.g., 'America/Denver') or 'UTC' as fallback.
        """
        tf = _get_timezone_finder()
        tz_name = tf.timezone_at(lat=lat, lng=lng)
        return tz_name if tz_name else 'UTC'


    # ------------------------------------------------------------------------------------------------- #
    #                                   OPEN-METEO API METHODS                                          #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def _normalize_open_meteo_response(data: dict, timezone_str: str = 'UTC') -> Optional[dict]:
        """
        Transform Open-Meteo API response to normalized format.
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

            # Find the hourly entry closest to current time
            try:
                tz = pytz.timezone(timezone_str)
                now = datetime.now(tz).replace(tzinfo=None)
            except (pytz.UnknownTimeZoneError, Exception):
                now = datetime.now()

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

            def get_hourly_value(key, idx):
                values = hourly.get(key, [])
                return values[idx] if idx < len(values) else None

            # Build normalized response
            normalized = {
                'current': {
                    'cloud_cover': get_current_value('cloud_cover', 'cloud_cover'),
                    'cloud_cover_low': get_hourly_value('cloud_cover_low', current_idx),
                    'cloud_cover_mid': get_hourly_value('cloud_cover_mid', current_idx),
                    'cloud_cover_high': get_hourly_value('cloud_cover_high', current_idx),
                    'visibility': get_hourly_value('visibility', current_idx),
                    'humidity': get_current_value('relative_humidity_2m', 'relative_humidity_2m'),
                    'wind_speed': get_current_value('wind_speed_10m', 'wind_speed_10m'),
                    'temperature': get_current_value('temperature_2m', 'temperature_2m'),
                    'precipitation_probability': get_hourly_value('precipitation_probability', current_idx),
                },
                'hourly': []
            }

            # Process hourly forecast
            for i, time_str in enumerate(times):
                normalized['hourly'].append({
                    'time': time_str,
                    'cloud_cover': get_hourly_value('cloud_cover', i),
                    'cloud_cover_low': get_hourly_value('cloud_cover_low', i),
                    'cloud_cover_mid': get_hourly_value('cloud_cover_mid', i),
                    'cloud_cover_high': get_hourly_value('cloud_cover_high', i),
                    'visibility': get_hourly_value('visibility', i),
                    'humidity': get_hourly_value('relative_humidity_2m', i),
                    'wind_speed': get_hourly_value('wind_speed_10m', i),
                    'temperature': get_hourly_value('temperature_2m', i),
                    'precipitation_probability': get_hourly_value('precipitation_probability', i),
                })

            return normalized

        except (KeyError, TypeError, IndexError):
            return None


    @staticmethod
    def fetch_open_meteo_forecast(lat: float, lng: float, days: int = 3) -> Optional[dict]:
        """
        Fetch weather forecast from Open-Meteo.
        Returns up to 16-day hourly forecast with cloud layers,
        visibility, humidity, wind, temperature, and precipitation.
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
            "temperature_2m",
            "precipitation_probability"
        ])

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


    @staticmethod
    def fetch_open_meteo_historical(
        lat: float,
        lng: float,
        start_date: date,
        end_date: date
    ) -> Optional[dict]:
        """
        Fetch historical weather from Open-Meteo Archive API.
        Archive has ~5 day delay from present.
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


    # ------------------------------------------------------------------------------------------------- #
    #                                    MAIN SERVICE METHODS                                           #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def get_weather_forecast(lat: float, lng: float, days: int = 3) -> dict:
        """
        Get weather forecast from Open-Meteo.

        Args:
            lat: Latitude (-90 to 90)
            lng: Longitude (-180 to 180)
            days: Forecast days (1-16, default 3)

        Returns:
            Normalized weather data with source indicator.
        """
        open_meteo_data = WeatherService.fetch_open_meteo_forecast(lat, lng, days)

        result = {
            'location': {
                'lat': round(float(lat), 2),
                'lng': round(float(lng), 2)
            },
            'forecast_generated': datetime.now(timezone.utc).isoformat(),
            'sources': {
                'open_meteo': open_meteo_data is not None
            },
            'current_conditions': {},
            'hourly_forecast': []
        }

        if open_meteo_data:
            result['current_conditions'] = open_meteo_data.get('current', {})
            result['hourly_forecast'] = open_meteo_data.get('hourly', [])

        return result


    # ------------------------------------------------------------------------------------------------- #
    #                                    UNIFIED API METHODS                                            #
    # ------------------------------------------------------------------------------------------------- #

    @staticmethod
    def classify_date(target_date: date, reference_today: date = None) -> str:
        """
        Classify a date to determine which data source to use.

        Returns:
            'forecast': Today to +16 days (use forecast API)
            'historical': Past dates beyond archive delay (use archive API)
            'historical_average': >16 days in future (average past years)
        """
        today = reference_today if reference_today else date.today()
        days_away = (target_date - today).days

        if days_away < -WeatherService.ARCHIVE_DELAY_DAYS:
            return "historical"
        elif days_away <= WeatherService.FORECAST_MAX_DAYS:
            return "forecast"
        else:
            return "historical_average"


    @staticmethod
    def get_historical_average(
        lat: float,
        lng: float,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """
        Compute historical averages for a date range from past 5 years.
        For dates >16 days in the future, we fetch the same dates from past years and average.
        """
        padded_start = start_date - timedelta(days=WeatherService.WINDOW_PADDING_DAYS)
        padded_end = end_date + timedelta(days=WeatherService.WINDOW_PADDING_DAYS)

        all_years_data: List[dict] = []

        for year in WeatherService.HISTORICAL_YEARS:
            try:
                hist_start = padded_start.replace(year=year)
                hist_end = padded_end.replace(year=year)
            except ValueError:
                # Handle Feb 29 in non-leap years
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

        return WeatherService._average_historical_data(all_years_data, start_date, end_date)


    @staticmethod
    def _average_historical_data(
        all_years_data: List[dict],
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Average hourly weather data across multiple years."""
        from collections import defaultdict

        hourly_buckets = defaultdict(list)

        for year_data in all_years_data:
            for entry in year_data.get('hourly', []):
                time_str = entry.get('time', '')
                if not time_str:
                    continue

                try:
                    dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    key = (dt.month, dt.day, dt.hour)
                    hourly_buckets[key].append(entry)
                except (ValueError, AttributeError):
                    continue

        averaged_hourly = []
        current_date = start_date

        while current_date <= end_date:
            for hour in range(24):
                key = (current_date.month, current_date.day, hour)
                entries = hourly_buckets.get(key, [])

                if not entries:
                    continue

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
                    'precipitation_probability': None,
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
        """Compute daily summary statistics from hourly data."""
        date_str = target_date.isoformat()

        day_entries = [
            e for e in hourly_data
            if e.get('time', '').startswith(date_str)
        ]

        if not day_entries:
            return {}

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
        appropriate data source (forecast, historical, or historical average).

        Args:
            lat: Latitude (-90 to 90)
            lng: Longitude (-180 to 180)
            start_date: Start of date range
            end_date: End of date range
            reference_today: The reference "today" date for the location's timezone.

        Returns:
            Unified weather response with 'current', 'daily', and metadata
        """
        local_today = reference_today if reference_today else date.today()
        rounded_lat = round(float(lat), 1)
        rounded_lng = round(float(lng), 1)

        # Get current conditions
        open_meteo_now = WeatherService.fetch_open_meteo_forecast(lat, lng, days=1)

        # Initialize response
        response = {
            'location': {'lat': rounded_lat, 'lng': rounded_lng},
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'current': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                **(open_meteo_now.get('current', {}) if open_meteo_now else {})
            },
            'daily': [],
            'sources': {'open_meteo': open_meteo_now is not None},
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

        # Fetch forecast data
        forecast_hourly = {}
        if forecast_dates:
            days_needed = (max(forecast_dates) - local_today).days + 1
            days_needed = min(days_needed, WeatherService.FORECAST_MAX_DAYS)

            open_meteo_data = WeatherService.fetch_open_meteo_forecast(lat, lng, days_needed)

            if open_meteo_data:
                for entry in open_meteo_data.get('hourly', []):
                    time_str = entry.get('time', '')
                    if time_str:
                        date_key = time_str[:10]
                        if date_key not in forecast_hourly:
                            forecast_hourly[date_key] = []
                        forecast_hourly[date_key].append(entry)

        # Fetch historical data
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

        # Fetch historical averages
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
