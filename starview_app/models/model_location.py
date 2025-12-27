# ----------------------------------------------------------------------------------------------------- #
# This model_location.py file defines the Location model:                                               #
#                                                                                                       #
# Purpose:                                                                                              #
# Represents a stargazing viewing location with coordinates and ratings. This is the core model of      #
# the application, storing all information about places where users can stargaze.                       #
#                                                                                                       #
# Key Features:                                                                                         #
# - Geographic data: latitude, longitude, elevation, and address information                            #
# - Review aggregation: Tracks average ratings and visitor counts                                       #
# - Verification system: Staff can verify locations with notes and timestamps                           #
# - Automatic enrichment: Triggers async Celery task on save to fetch address and elevation data        #
#                                                                                                       #
# Service Integration:                                                                                  #
# The save() method automatically triggers async enrichment task for new locations via Celery.          #
# This provides instant response to users while Mapbox enrichment happens in background (2-5 seconds).  #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.db import models
from django.contrib.auth.models import User
import logging
from starview_app.services.location_service import LocationService

# Configure module logger
logger = logging.getLogger(__name__)

# Import validators:
from starview_app.utils import (
    sanitize_plain_text,
    validate_latitude,
    validate_longitude,
    validate_elevation
)



class Location(models.Model):
    # Location type choices
    LOCATION_TYPES = [
        ('dark_sky_site', 'Dark Sky Site'),
        ('observatory', 'Observatory'),
        ('campground', 'Campground'),
        ('viewpoint', 'Viewpoint'),
        ('other', 'Other'),
    ]

    # Timestamps:
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Basic information:
    name = models.CharField(max_length=200)
    location_type = models.CharField(
        max_length=50,
        choices=LOCATION_TYPES,
        default='viewpoint',
        help_text="Type of stargazing location"
    )
    added_by = models.ForeignKey(User, on_delete=models.CASCADE)

    # Geographic data:
    latitude = models.FloatField(validators=[validate_latitude])
    longitude = models.FloatField(validators=[validate_longitude])
    elevation = models.FloatField(default=0, validators=[validate_elevation], help_text="Elevation in meters")

    # Address information (auto-populated via Mapbox):
    formatted_address = models.CharField(max_length=500, blank=True, null=True, help_text="Full formatted address from geocoding")
    administrative_area = models.CharField(max_length=200, blank=True, null=True, help_text="State/Province/Region")
    locality = models.CharField(max_length=200, blank=True, null=True, help_text="City/Town")
    country = models.CharField(max_length=200, blank=True, null=True)

    # Rating aggregation:
    rating_count = models.PositiveIntegerField(default=0)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00, help_text="Average rating (0.00-5.00)")

    # Verification (staff only):
    is_verified = models.BooleanField(default=False, help_text="Whether this location has been verified by staff")
    verification_date = models.DateTimeField(null=True, blank=True, help_text="When the location was verified")
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_locations', help_text="Staff member who verified this location")
    verification_notes = models.TextField(blank=True, help_text="Staff notes about the verification process")

    # Usage tracking:
    times_reported = models.IntegerField(default=0, help_text="Number of times this location has been reported")
    last_visited = models.DateTimeField(null=True, blank=True, help_text="Last time someone reported visiting this location")
    visitor_count = models.IntegerField(default=0, help_text="Number of unique visitors who have reviewed this location")


    # Delegate to LocationService for data enrichment:
    def update_address_from_coordinates(self):
        return LocationService.update_address_from_coordinates(self)

    def update_elevation_from_mapbox(self):
        return LocationService.update_elevation_from_mapbox(self)


    # Override save to sanitize name, validate coordinates, and enrich location data:
    def save(self, *args, **kwargs):
        try:
            # Sanitize location name to prevent XSS attacks
            if self.name:
                self.name = sanitize_plain_text(self.name)

            # Validate coordinates (run validators explicitly)
            validate_latitude(self.latitude)
            validate_longitude(self.longitude)
            validate_elevation(self.elevation)

            is_new = not self.pk

            # First save to get the ID:
            super().save(*args, **kwargs)

            # If this is a new location or coordinates have changed, enrich data
            if is_new or any(
                    field in kwargs.get('update_fields', [])
                    for field in ['latitude', 'longitude']
            ):
                # Import here to avoid circular imports
                from django.conf import settings

                # Check if Celery worker is enabled via environment variable
                # Set CELERY_ENABLED=True in .env when worker is running (production)
                # Set CELERY_ENABLED=False or omit to use sync enrichment (development/free tier)
                use_celery = getattr(settings, 'CELERY_ENABLED', False)

                if use_celery:
                    # Async enrichment via Celery (requires worker running)
                    from starview_app.utils.tasks import enrich_location_data
                    enrich_location_data.delay(self.pk)
                    logger.info(
                        "Queued async enrichment task for location '%s' (ID: %d)",
                        self.name,
                        self.pk,
                        extra={'location_id': self.pk, 'location_name': self.name, 'mode': 'async'}
                    )
                else:
                    # Sync enrichment (fallback when no worker available)
                    logger.info(
                        "Running sync enrichment for location '%s' (ID: %d) - Celery disabled",
                        self.name,
                        self.pk,
                        extra={'location_id': self.pk, 'location_name': self.name, 'mode': 'sync'}
                    )
                    from starview_app.services.location_service import LocationService
                    LocationService.initialize_location_data(self)

        except Exception as e:
            logger.error(
                "Error saving location '%s': %s",
                self.name if self.name else 'Unknown',
                str(e),
                extra={'location_name': self.name, 'error': str(e)},
                exc_info=True
            )
            raise


    def __str__(self):
        return f"{self.name} ({self.latitude}, {self.longitude})"


    class Meta:
        indexes = [
            models.Index(fields=['latitude', 'longitude'], name='location_coords_idx'),
            models.Index(fields=['country'], name='country_idx'),
            models.Index(fields=['created_at'], name='created_at_idx'),
            models.Index(fields=['added_by'], name='added_by_idx'),
        ]
        ordering = ['-created_at']
        verbose_name = 'Location'
        verbose_name_plural = 'Locations'
