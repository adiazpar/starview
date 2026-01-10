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
#                                                                                                      #
# Error Handling:                                                                                      #
# Both APIs are free with no API keys required. Service degrades gracefully when one API fails,        #
# returning partial data from the available source. Only returns 503 when both APIs fail.              #
#                                                                                                      #
# Caching:                                                                                             #
# Results are cached for 30 minutes at the view layer. Coordinates are rounded to 2 decimal            #
# places (~1km) to increase cache hit rate while maintaining accuracy for weather data.                #
# ----------------------------------------------------------------------------------------------------- #

from datetime import datetime, timezone
from typing import Optional

import requests


class WeatherService:
    """Weather data aggregation service for astronomy applications."""

    # API Configuration
    SEVEN_TIMER_URL = "http://www.7timer.info/bin/api.pl"
    OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
    REQUEST_TIMEOUT = 10  # seconds

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
    def _normalize_open_meteo_response(data: dict) -> Optional[dict]:
        """
        Transform Open-Meteo API response to normalized format.

        Open-Meteo returns hourly arrays for each requested variable.
        We extract cloud layers, visibility, humidity, wind, temperature,
        and precipitation probability.
        """
        if not data or 'hourly' not in data:
            return None

        try:
            hourly = data['hourly']
            times = hourly.get('time', [])

            if not times:
                return None

            # Get current conditions from first entry
            normalized = {
                'current': {
                    'cloud_cover': hourly.get('cloud_cover', [None])[0],
                    'cloud_cover_low': hourly.get('cloud_cover_low', [None])[0],
                    'cloud_cover_mid': hourly.get('cloud_cover_mid', [None])[0],
                    'cloud_cover_high': hourly.get('cloud_cover_high', [None])[0],
                    'visibility': hourly.get('visibility', [None])[0],
                    'humidity': hourly.get('relative_humidity_2m', [None])[0],
                    'wind_speed': hourly.get('wind_speed_10m', [None])[0],
                    'temperature': hourly.get('temperature_2m', [None])[0],
                    'precipitation_probability': hourly.get('precipitation_probability', [None])[0],
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
        """
        rounded_lat, rounded_lng = WeatherService._round_coordinates(lat, lng)

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

        url = (
            f"{WeatherService.OPEN_METEO_URL}"
            f"?latitude={rounded_lat}&longitude={rounded_lng}"
            f"&hourly={hourly_vars}"
            f"&forecast_days={days}"
        )

        data = WeatherService._make_request(url)
        if not data:
            return None

        return WeatherService._normalize_open_meteo_response(data)



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
