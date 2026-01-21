# IP Geolocation endpoint for approximate user location.
# Uses Cloudflare's geolocation headers (requires "Add visitor location headers" Managed Transform).
# Provides fallback location for users without browser geolocation or profile location.
#
# Privacy: Location data is NOT stored. It's only used in-memory to respond to the request.

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def geolocate_ip(request):
    """
    Get approximate location from Cloudflare geolocation headers.

    Cloudflare adds these headers when "Add visitor location headers" Managed Transform
    is enabled. Returns city-level accuracy (~10-50km). Data is NOT stored.

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
    # Cloudflare geolocation headers (requires Managed Transform enabled)
    lat = request.META.get('HTTP_CF_IPLATITUDE')
    lng = request.META.get('HTTP_CF_IPLONGITUDE')

    if lat and lng:
        try:
            return Response({
                'latitude': float(lat),
                'longitude': float(lng),
                'city': request.META.get('HTTP_CF_IPCITY') or None,
                'region': request.META.get('HTTP_CF_REGION') or None,
                'country': request.META.get('HTTP_CF_IPCOUNTRY') or None,
                'source': 'ip',
            })
        except (ValueError, TypeError):
            pass

    # Development fallback (when not going through Cloudflare)
    if settings.DEBUG:
        return Response({
            'latitude': 37.7749,
            'longitude': -122.4194,
            'city': 'San Francisco',
            'region': 'California',
            'country': 'US',
            'source': 'ip',
        })

    # Production without Cloudflare headers
    return Response({
        'latitude': None,
        'longitude': None,
    })
