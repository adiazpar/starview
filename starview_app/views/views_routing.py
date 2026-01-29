# ----------------------------------------------------------------------------------------------------- #
# This views_routing.py file provides a backend proxy for routing/directions API services.             #
#                                                                                                       #
# Purpose:                                                                                              #
# Proxies requests to OpenRouteService API while keeping the API key server-side to prevent            #
# quota abuse. The frontend calls this endpoint instead of directly calling external routing APIs.     #
#                                                                                                       #
# Security Benefits:                                                                                    #
# - API key never exposed in frontend JavaScript (prevents quota theft)                                 #
# - Rate limiting via Django throttling (prevents abuse)                                                #
# - Input validation prevents malicious requests to upstream API                                        #
# ----------------------------------------------------------------------------------------------------- #

import requests
from django.conf import settings
from rest_framework.decorators import api_view, throttle_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from starview_app.utils import DirectionsThrottle


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([DirectionsThrottle])
def get_directions(request):
    """
    Proxy directions requests to OpenRouteService.

    Validates coordinates and rate-limits requests to prevent abuse.
    The API key is kept server-side, never exposed to the frontend.

    Query Parameters:
        origin: Starting coordinates as "lat,lng" (e.g., "37.7749,-122.4194")
        destination: Ending coordinates as "lat,lng" (e.g., "34.0522,-118.2437")

    Returns:
        GeoJSON response from OpenRouteService with route geometry and summary.
    """
    origin = request.query_params.get('origin')
    destination = request.query_params.get('destination')

    if not origin or not destination:
        return Response(
            {'error': 'Both origin and destination are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate coordinate format (lat,lng)
    try:
        origin_parts = [float(x) for x in origin.split(',')]
        dest_parts = [float(x) for x in destination.split(',')]

        if len(origin_parts) != 2 or len(dest_parts) != 2:
            raise ValueError("Invalid coordinate format")

        # Validate ranges (lat: -90 to 90, lng: -180 to 180)
        for lat, lng in [origin_parts, dest_parts]:
            if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                raise ValueError("Coordinates out of range")
    except (ValueError, AttributeError):
        return Response(
            {'error': 'Invalid coordinate format. Use lat,lng'},
            status=status.HTTP_400_BAD_REQUEST
        )

    api_key = getattr(settings, 'OPENROUTESERVICE_API_KEY', None)
    if not api_key:
        return Response(
            {'error': 'Routing service not configured'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    try:
        # ORS expects coordinates as [lng, lat] (GeoJSON format, reversed from lat,lng)
        response = requests.post(
            'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
            headers={
                'Authorization': api_key,
                'Content-Type': 'application/json',
            },
            json={
                'coordinates': [
                    [origin_parts[1], origin_parts[0]],  # [lng, lat]
                    [dest_parts[1], dest_parts[0]],      # [lng, lat]
                ],
            },
            timeout=10
        )
        response.raise_for_status()
        return Response(response.json())
    except requests.exceptions.Timeout:
        return Response(
            {'error': 'Routing service timed out'},
            status=status.HTTP_504_GATEWAY_TIMEOUT
        )
    except requests.exceptions.RequestException:
        return Response(
            {'error': 'Failed to fetch directions'},
            status=status.HTTP_502_BAD_GATEWAY
        )
