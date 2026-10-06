# IP Geolocation endpoint for approximate user location.
# Uses Cloudflare's geolocation headers (requires "Add visitor location headers" Managed Transform).
# Provides fallback location for users without browser geolocation or profile location.
#
# Privacy: Location data is NOT stored. It's only used in-memory to respond to the request.

import math
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@never_cache
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
            latitude, longitude = float(lat), float(lng)
            if not (math.isfinite(latitude) and math.isfinite(longitude)
                    and -90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError
            return Response({
                'latitude': latitude,
                'longitude': longitude,
                'city': request.META.get('HTTP_CF_IPCITY') or None,
                'region': request.META.get('HTTP_CF_REGION') or None,
                'country': request.META.get('HTTP_CF_IPCOUNTRY') or None,
                'source': 'ip',
            })
        except (ValueError, TypeError):
            pass

    # No location evidence is available on ordinary localhost requests.
    # Let the user share browser location or search instead of inventing a city.
    return Response({
        'latitude': None,
        'longitude': None,
        'source': 'unavailable',
    })
