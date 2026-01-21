# IP Geolocation endpoint for approximate user location.
# Uses Cloudflare's free geolocation headers (no external API calls).
# Provides fallback location for users without browser geolocation or profile location.
#
# Requires "Add visitor location headers" Managed Transform enabled in Cloudflare:
# Dashboard → Rules → Transform Rules → Managed Transforms → Enable "Add visitor location headers"

import logging
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def geolocate_ip(request):
    """
    Get approximate location from Cloudflare geolocation headers.

    Cloudflare automatically adds geolocation headers to requests when
    "Add visitor location headers" Managed Transform is enabled.
    No external API calls needed - instant response with no rate limits.

    Response:
        {
            "latitude": 47.6062,
            "longitude": -122.3321,
            "city": "Seattle",
            "region": "Washington",
            "country": "US",
            "source": "ip"
        }

    Fallback response (local development or headers missing):
        {
            "latitude": null,
            "longitude": null,
            "error": "Geolocation headers not available"
        }
    """
    # Cloudflare headers (lowercase with HTTP_ prefix in Django)
    # See: https://developers.cloudflare.com/rules/transform/managed-transforms/reference/
    lat = request.META.get('HTTP_CF_IPLATITUDE')
    lng = request.META.get('HTTP_CF_IPLONGITUDE')
    city = request.META.get('HTTP_CF_IPCITY')
    region = request.META.get('HTTP_CF_REGION')
    country = request.META.get('HTTP_CF_IPCOUNTRY')

    # Debug: Log all CF headers received (remove after debugging)
    cf_headers = {k: v for k, v in request.META.items() if 'CF' in k.upper()}
    if cf_headers:
        logger.info(f'Cloudflare headers received: {cf_headers}')
    else:
        logger.warning('No Cloudflare headers found in request')

    # If Cloudflare headers present, return geolocation data
    if lat and lng:
        try:
            return Response({
                'latitude': float(lat),
                'longitude': float(lng),
                'city': city or None,
                'region': region or None,
                'country': country or None,
                'source': 'ip',
            })
        except (ValueError, TypeError):
            logger.warning(f'Invalid Cloudflare geo headers: lat={lat}, lng={lng}')

    # Local development fallback (when not going through Cloudflare)
    # Only enabled in DEBUG mode to avoid exposing fallback in production
    if settings.DEBUG:
        logger.debug('Using development fallback for geolocation (no Cloudflare headers)')
        return Response({
            'latitude': 37.7749,
            'longitude': -122.4194,
            'city': 'San Francisco',
            'region': 'California',
            'country': 'US',
            'source': 'ip',
            'note': 'Development fallback (Cloudflare headers not available)',
        })

    # Production without Cloudflare headers (shouldn't happen if configured correctly)
    logger.warning('Geolocation request without Cloudflare headers in production')
    return Response({
        'latitude': None,
        'longitude': None,
        'error': 'Geolocation not available',
    })
