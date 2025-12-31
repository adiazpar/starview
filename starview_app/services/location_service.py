# ----------------------------------------------------------------------------------------------------- #
# This location_service.py file handles automatic data enrichment for Location objects:                 #
#                                                                                                       #
# 1. Address Enrichment → Fetches city, state/region, and country from coordinates                      #
# 2. Elevation Data → Retrieves elevation in meters from Mapbox terrain API                             #
# 3. Initialization → Orchestrates all enrichment operations when a location is created                 #
#                                                                                                       #
# Data Flow:                                                                                            #
# User creates location with coordinates → LocationService enriches with address and elevation →        #
# Fully populated location ready for display                                                            #
#                                                                                                       #
# Service Layer Pattern:                                                                                #
# This service separates business logic from data models, following Django best practices:              #
# - Models define data structure (what to store)                                                        #
# - Services define business logic (how to process data)                                                #
# - Views coordinate between user requests and services                                                 #
#                                                                                                       #
# External API Dependencies:                                                                            #
# - Mapbox Geocoding API: Reverse geocoding for addresses                                               #
# - Mapbox Terrain-RGB API: High-precision elevation data (0.1m resolution)                             #
# - Can be disabled via settings.DISABLE_EXTERNAL_APIS for testing                                      #
#                                                                                                       #
# Usage:                                                                                                #
# - Automatically called when Location.save() is triggered (new locations)                              #
# - Manually triggered via API endpoints for refreshing data                                            #
# - All methods are static and can be called independently                                              #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
import math
from io import BytesIO

import requests
from PIL import Image
from django.conf import settings


class LocationService:



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                       HELPER METHODS                                              #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    # ----------------------------------------------------------------------------- #
    # Makes Mapbox API requests with consistent error handling.                     #
    #                                                                               #
    # Args:   url (str): The Mapbox API URL to request                              #
    # Returns: Response JSON data if successful, None otherwise                     #
    #                                                                               #
    # Security: 10-second timeout prevents hanging on slow/unresponsive API         #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def _make_mapbox_request(url):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout as e:
            # Error: Mapbox API request timed out after 10 seconds
            return None

        except requests.exceptions.RequestException as e:
            # Error: Mapbox API request failed: {error}
            return None

        except ValueError as e:
            # Error: Invalid JSON response from Mapbox: {error}
            return None



    # ------------------------------------------------------------------------------------------------- #
    #                                                                                                   #
    #                                    SERVICE METHODS                                                #
    #                                                                                                   #
    # ------------------------------------------------------------------------------------------------- #

    # Updates address fields using Mapbox reverse geocoding:
    @staticmethod
    def update_address_from_coordinates(location):
        mapbox_token = settings.MAPBOX_TOKEN

        url = (f"https://api.mapbox.com/geocoding/v5/mapbox.places/"
               f"{location.longitude},{location.latitude}.json"
               f"?access_token={mapbox_token}&types=place,region,country")

        data = LocationService._make_mapbox_request(url)
        if not data or not data.get('features'):
            # Warning: No address data found for location: {location.name}
            return False

        # Process the response to extract address components
        for feature in data['features']:
            if 'place_type' in feature:
                if 'country' in feature['place_type']:
                    location.country = feature['text']
                elif 'region' in feature['place_type']:
                    location.administrative_area = feature['text']
                elif 'place' in feature['place_type']:
                    location.locality = feature['text']

        # Create formatted address
        address_parts = [
            part for part in [location.locality, location.administrative_area, location.country]
            if part
        ]

        location.formatted_address = ", ".join(address_parts)
        location.save(update_fields=[
            'formatted_address', 'administrative_area', 'locality', 'country'
        ])

        # Info: Updated address for {location.name}: {location.formatted_address}
        return True


    # Updates elevation using Mapbox Terrain-RGB API (0.1m precision):
    @staticmethod
    def update_elevation_from_mapbox(location):
        mapbox_token = settings.MAPBOX_TOKEN
        lat = float(location.latitude)
        lon = float(location.longitude)

        # Use zoom 14 for good precision while keeping tile size manageable
        zoom = 14
        n = 2 ** zoom

        # Calculate tile coordinates from lat/lon
        tile_x = int((lon + 180) / 360 * n)
        tile_y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)

        # Calculate pixel position within the 256x256 tile
        tile_lon_min = tile_x / n * 360 - 180
        tile_lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * tile_y / n))))
        tile_lon_max = (tile_x + 1) / n * 360 - 180
        tile_lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile_y + 1) / n))))

        pixel_x = int((lon - tile_lon_min) / (tile_lon_max - tile_lon_min) * 256)
        pixel_y = int((tile_lat_max - lat) / (tile_lat_max - tile_lat_min) * 256)

        # Clamp pixel values to valid range
        pixel_x = max(0, min(255, pixel_x))
        pixel_y = max(0, min(255, pixel_y))

        # Fetch the Terrain-RGB tile
        url = (f"https://api.mapbox.com/v4/mapbox.terrain-rgb/{zoom}/{tile_x}/{tile_y}.pngraw"
               f"?access_token={mapbox_token}")

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
        except requests.exceptions.RequestException:
            # Warning: Failed to fetch elevation tile for location: {location.name}
            return False

        # Decode elevation from RGB values
        # Formula: elevation = -10000 + ((R * 256² + G * 256 + B) * 0.1)
        try:
            img = Image.open(BytesIO(response.content))
            r, g, b = img.getpixel((pixel_x, pixel_y))[:3]
            elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
        except Exception:
            # Warning: Failed to decode elevation for location: {location.name}
            return False

        location.elevation = round(elevation, 1)
        location.save(update_fields=['elevation'])
        # Info: Updated elevation for {location.name} to {location.elevation}m
        return True


    # Initialize all location data after creation:
    @staticmethod
    def initialize_location_data(location):
        if getattr(settings, 'DISABLE_EXTERNAL_APIS', False):
            # Info: Skipping external API calls for {location.name} (APIs disabled)
            return

        # Update address from coordinates
        try:
            LocationService.update_address_from_coordinates(location)
        except Exception as e:
            # Warning: Could not update address for {location.name}: {error}
            pass

        # Update elevation from Mapbox
        try:
            LocationService.update_elevation_from_mapbox(location)
        except Exception as e:
            # Warning: Could not update elevation for {location.name}: {error}
            pass