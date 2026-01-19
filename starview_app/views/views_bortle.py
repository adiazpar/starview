# ----------------------------------------------------------------------------------------------------- #
# Bortle Scale API Endpoint                                                                           #
#                                                                                                      #
# Purpose:                                                                                             #
# Returns the Bortle scale rating (1-9) for any coordinate, derived from World Atlas 2015             #
# light pollution data with corrections applied. Integrates with moon phase and weather APIs          #
# to create a comprehensive stargazing quality score.                                                 #
#                                                                                                      #
# Architecture:                                                                                        #
# - Plain Django function-based view (public endpoint, no authentication)                            #
# - Reads GeoTIFF pixel value using rasterio with coordinate transformation                           #
# - Applies temporal correction for light pollution growth since 2015                                 #
# - Converts artificial brightness (mcd/m2) to SQM (Sky Quality Meter) magnitude                     #
# - Applies zenith-to-Bortle adjustment (zenith-only data underestimates whole-sky Bortle)           #
# - Results cached for 30 days at ~1km precision (light pollution changes slowly)                    #
#                                                                                                      #
# Data Source:                                                                                         #
# Falchi et al. 2016 "New World Atlas of Artificial Night Sky Brightness"                            #
# GeoTIFF stored at /var/data/World_Atlas_2015.tif (persistent Render disk)                          #
#                                                                                                      #
# Corrections Applied:                                                                                 #
# 1. Temporal: ~2.5% annual increase since 2015 (factor of ~1.31 for 11 years)                       #
# 2. Zenith→Bortle: +1 class for light-polluted areas (SQM < 21) per Lorenz (2024)                   #
#    See: https://djlorenz.github.io/astronomy/lp/bortle.html                                        #
# ----------------------------------------------------------------------------------------------------- #

import logging
import math
import os

from django.core.cache import cache
from django.http import JsonResponse

from ..utils.cache import bortle_cache_key, BORTLE_CACHE_TIMEOUT

logger = logging.getLogger(__name__)

# GeoTIFF file paths (production on Render, fallback for local dev)
GEOTIFF_PATH_PRODUCTION = '/var/data/World_Atlas_2015.tif'
GEOTIFF_PATH_LOCAL = os.path.expanduser('~/Downloads/World_Atlas_2015.tif')

# Natural sky brightness (mcd/m2) - baseline without artificial light
NATURAL_SKY_BRIGHTNESS = 0.171

# Temporal correction: light pollution growth since 2015
# Conservative estimate of 2.5% annual increase over 11 years (2015 → 2026)
# Based on research showing 1.8-6% annual increases in urban areas
# See: https://www.nature.com/articles/s43017-024-00555-9
TEMPORAL_CORRECTION_FACTOR = 1.31  # (1.025 ** 11)

# Zenith-to-Bortle adjustment threshold
# Per Lorenz (2024): zenith-only measurements underestimate Bortle by ~1 class
# in light-polluted areas because they miss horizon light domes
# Apply +1 class adjustment when SQM < 21 (suburban and brighter)
ZENITH_BORTLE_ADJUSTMENT_THRESHOLD = 21.0

# Bortle scale definitions: (min_sqm, max_sqm, description, quality)
# SQM = Sky Quality Meter reading in magnitudes per square arcsecond
# Standard thresholds from https://unittoolbox.com/bortle-scale-sqm-converter/
BORTLE_SCALE = [
    (21.7, 25.0, 'Excellent dark-sky site', 'excellent'),       # Class 1: 21.7+
    (21.5, 21.7, 'Typical truly dark site', 'excellent'),       # Class 2: 21.5-21.7
    (21.3, 21.5, 'Rural sky', 'very_good'),                     # Class 3: 21.3-21.5
    (20.4, 21.3, 'Rural/suburban transition', 'good'),          # Class 4: 20.4-21.3
    (19.1, 20.4, 'Suburban sky', 'moderate'),                   # Class 5: 19.1-20.4
    (18.0, 19.1, 'Bright suburban sky', 'limited'),             # Class 6: 18.0-19.1
    (16.8, 18.0, 'Suburban/urban transition', 'poor'),          # Class 7: 16.8-18.0
    (15.5, 16.8, 'City sky', 'poor'),                           # Class 8: 15.5-16.8
    (0.0, 15.5, 'Inner-city sky', 'very_poor'),                 # Class 9: <15.5
]


def _get_geotiff_path():
    """Return the path to the GeoTIFF file, checking production first."""
    if os.path.exists(GEOTIFF_PATH_PRODUCTION):
        return GEOTIFF_PATH_PRODUCTION
    if os.path.exists(GEOTIFF_PATH_LOCAL):
        return GEOTIFF_PATH_LOCAL
    return None


def _brightness_to_sqm(brightness_mcd_m2):
    """
    Convert artificial sky brightness to SQM (Sky Quality Meter) value.

    Applies temporal correction to account for light pollution growth since 2015,
    then converts to SQM using the Falchi et al. 2016 formula.

    Args:
        brightness_mcd_m2: Artificial sky brightness in mcd/m2 (from 2015 data)

    Returns:
        SQM value in magnitudes per square arcsecond (adjusted for current conditions)
    """
    # Apply temporal correction: light pollution has increased since 2015
    adjusted_brightness = brightness_mcd_m2 * TEMPORAL_CORRECTION_FACTOR

    # Convert to SQM using Falchi formula
    total_brightness = adjusted_brightness + NATURAL_SKY_BRIGHTNESS
    sqm = math.log10(total_brightness / 108000000) / -0.4
    return round(sqm, 2)


def _sqm_to_bortle(sqm):
    """
    Convert SQM value to Bortle class (1-9) with zenith→Bortle adjustment.

    The World Atlas provides zenith-only brightness measurements, but the Bortle
    scale considers the entire sky including horizon light domes. Per Lorenz (2024),
    zenith readings underestimate Bortle class by ~1 in light-polluted areas.

    Args:
        sqm: Sky Quality Meter value (already temporally adjusted)

    Returns:
        Tuple of (bortle_class, description, quality)
    """
    # First, get the raw Bortle class from SQM
    raw_bortle = 9  # Default
    for i, (min_sqm, max_sqm, description, quality) in enumerate(BORTLE_SCALE):
        if min_sqm <= sqm < max_sqm:
            raw_bortle = i + 1
            break

    # Apply zenith→Bortle adjustment for light-polluted areas
    # Zenith-only data misses horizon light domes that the Bortle scale considers
    if sqm < ZENITH_BORTLE_ADJUSTMENT_THRESHOLD:
        adjusted_bortle = min(raw_bortle + 1, 9)  # Cap at class 9
    else:
        adjusted_bortle = raw_bortle

    # Get description and quality for the adjusted class
    if adjusted_bortle <= len(BORTLE_SCALE):
        _, _, description, quality = BORTLE_SCALE[adjusted_bortle - 1]
    else:
        description, quality = 'Inner-city sky', 'very_poor'

    return (adjusted_bortle, description, quality)


def _sample_geotiff(geotiff_path, lat, lng):
    """
    Sample the GeoTIFF pixel value at the given coordinates.

    Args:
        geotiff_path: Path to the GeoTIFF file
        lat: Latitude (-90 to 90)
        lng: Longitude (-180 to 180)

    Returns:
        Pixel value (brightness in mcd/m2) or None if sampling failed
    """
    try:
        import rasterio

        with rasterio.open(geotiff_path) as dataset:
            # Transform lat/lng to the dataset's coordinate reference system
            # World Atlas 2015 uses EPSG:4326 (WGS84), so coords are direct
            row, col = dataset.index(lng, lat)

            # Read the single pixel value
            window = rasterio.windows.Window(col, row, 1, 1)
            data = dataset.read(1, window=window)

            if data.size == 0:
                return None

            pixel_value = float(data[0, 0])

            # Handle nodata values (typically very large negative numbers or specific nodata)
            if dataset.nodata is not None and pixel_value == dataset.nodata:
                return None

            # The World Atlas values are already in mcd/m2
            return pixel_value

    except Exception as e:
        logger.error(f'Error sampling GeoTIFF at ({lat}, {lng}): {e}')
        return None


def get_bortle(request):
    """
    GET /api/bortle/

    Query Parameters:
        lat: Latitude (-90 to 90, required)
        lng: Longitude (-180 to 180, required)

    Returns:
        JSON with Bortle class, SQM value, and descriptive information.

    Response Structure:
        {
            "bortle": 4,
            "sqm": 20.8,
            "description": "Rural/suburban transition",
            "quality": "good",
            "location": {"lat": 34.05, "lng": -118.25}
        }

    Error Responses:
        400: Invalid parameters
        503: GeoTIFF data unavailable
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
            raise ValueError('Coordinates out of range')
    except ValueError:
        return JsonResponse({
            'error': 'validation_error',
            'message': 'Invalid lat/lng. lat must be -90 to 90, lng must be -180 to 180.',
            'status_code': 400
        }, status=400)

    # Check cache first
    cache_key = bortle_cache_key(lat, lng)
    cached_data = cache.get(cache_key)

    if cached_data:
        return JsonResponse(cached_data)

    # Check if GeoTIFF is available
    geotiff_path = _get_geotiff_path()
    if not geotiff_path:
        return JsonResponse({
            'error': 'service_unavailable',
            'message': 'Light pollution data is not available. Please try again later.',
            'status_code': 503
        }, status=503)

    # Sample the GeoTIFF
    brightness = _sample_geotiff(geotiff_path, lat, lng)

    if brightness is None:
        # Location might be over water or outside data coverage
        return JsonResponse({
            'error': 'no_data',
            'message': 'No light pollution data available for this location (may be over water or outside coverage).',
            'status_code': 404
        }, status=404)

    # Convert brightness to SQM and Bortle class
    sqm = _brightness_to_sqm(brightness)
    bortle_class, description, quality = _sqm_to_bortle(sqm)

    # Build response
    response_data = {
        'bortle': bortle_class,
        'sqm': sqm,
        'description': description,
        'quality': quality,
        'location': {
            'lat': round(lat, 4),
            'lng': round(lng, 4)
        }
    }

    # Cache the result
    cache.set(cache_key, response_data, BORTLE_CACHE_TIMEOUT)

    return JsonResponse(response_data)
