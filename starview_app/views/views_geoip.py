# IP Geolocation endpoint for approximate user location.
# Uses Cloudflare's geolocation headers (preferred) with ip-api.com fallback.
# Provides fallback location for users without browser geolocation or profile location.
#
# Priority: Cloudflare headers > ip-api.com > Dev fallback (DEBUG only)

import requests
import logging
from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class GeoIPThrottle(AnonRateThrottle):
    """Limit IP geolocation requests to prevent abuse of ip-api.com fallback."""
    rate = '10/minute'


def get_client_ip(request):
    """Extract client IP from request, handling proxies."""
    # Cloudflare's connecting IP header (most reliable when using CF)
    cf_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_ip:
        return cf_ip

    # Standard forwarded header
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()

    return request.META.get('REMOTE_ADDR')


def is_private_ip(ip):
    """Check if IP address is private/local (not publicly routable)."""
    if not ip or ip in ('127.0.0.1', 'localhost', '::1'):
        return True
    # RFC 1918 private ranges
    if ip.startswith('10.') or ip.startswith('192.168.'):
        return True
    if ip.startswith('172.'):
        try:
            second_octet = int(ip.split('.')[1])
            if 16 <= second_octet <= 31:
                return True
        except (ValueError, IndexError):
            pass
    return False


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([GeoIPThrottle])
def geolocate_ip(request):
    """
    Get approximate location from IP address.

    Uses Cloudflare geolocation headers if available (instant, no rate limit).
    Falls back to ip-api.com if Cloudflare headers not present.

    Response:
        {
            "latitude": 47.6062,
            "longitude": -122.3321,
            "city": "Seattle",
            "region": "Washington",
            "country": "US",
            "source": "ip"
        }
    """
    # Try Cloudflare headers first (preferred - instant, no external API call)
    lat = request.META.get('HTTP_CF_IPLATITUDE')
    lng = request.META.get('HTTP_CF_IPLONGITUDE')

    if lat and lng:
        try:
            city = request.META.get('HTTP_CF_IPCITY')
            region = request.META.get('HTTP_CF_REGION')
            country = request.META.get('HTTP_CF_IPCOUNTRY')

            logger.debug(f'Using Cloudflare geolocation: {city}, {region}')
            return Response({
                'latitude': float(lat),
                'longitude': float(lng),
                'city': city or None,
                'region': region or None,
                'country': country or None,
                'source': 'ip',
            })
        except (ValueError, TypeError) as e:
            logger.warning(f'Invalid Cloudflare geo headers: {e}')

    # Fallback: Get client IP and check for private/local IPs
    client_ip = get_client_ip(request)

    if is_private_ip(client_ip):
        if settings.DEBUG:
            # Dev fallback - San Francisco
            return Response({
                'latitude': 37.7749,
                'longitude': -122.4194,
                'city': 'San Francisco',
                'region': 'California',
                'country': 'US',
                'source': 'ip',
                'note': 'Development fallback',
            })
        else:
            # Production with private IP (shouldn't happen)
            logger.warning(f'Private IP in production: {client_ip}')
            return Response({
                'latitude': None,
                'longitude': None,
                'error': 'Geolocation not available',
            })

    # Fallback: Use ip-api.com for public IPs when Cloudflare headers missing
    cache_key = f'geoip:{client_ip}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    try:
        # ip-api.com free tier (HTTP only, 45 req/min)
        response = requests.get(
            f'http://ip-api.com/json/{client_ip}',
            params={'fields': 'status,lat,lon,city,regionName,country'},
            timeout=5
        )
        data = response.json()

        if data.get('status') == 'success':
            result = {
                'latitude': data.get('lat'),
                'longitude': data.get('lon'),
                'city': data.get('city'),
                'region': data.get('regionName'),
                'country': data.get('country'),
                'source': 'ip',
            }
            # Cache for 1 hour
            cache.set(cache_key, result, timeout=3600)
            logger.debug(f'Using ip-api.com geolocation for {client_ip}')
            return Response(result)
        else:
            logger.warning(f'ip-api.com failed for {client_ip}: {data}')

    except requests.RequestException as e:
        logger.error(f'ip-api.com request failed: {e}')

    # All methods failed
    return Response({
        'latitude': None,
        'longitude': None,
        'error': 'Geolocation not available',
    })
