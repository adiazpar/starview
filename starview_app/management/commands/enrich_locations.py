"""
Location Enrichment Management Command

Re-enriches all locations with fresh Mapbox geocoding and elevation data.
Overwrites existing values regardless of whether they're populated.

Usage:
    python manage.py enrich_locations
    python manage.py enrich_locations --dry-run
    python manage.py enrich_locations --id 123
    python manage.py enrich_locations --type observatory
    python manage.py enrich_locations --elevation-only
"""

import time

from django.core.management.base import BaseCommand

from starview_app.models import Location
from starview_app.services.location_service import LocationService


class Command(BaseCommand):
    help = 'Re-enrich all locations with Mapbox geocoding and elevation data'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )
        parser.add_argument(
            '--id',
            type=int,
            help='Enrich a specific location by ID'
        )
        parser.add_argument(
            '--type',
            type=str,
            help='Filter by location type (e.g., observatory, dark_sky_site)'
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=0.5,
            help='Delay between API calls in seconds (default: 0.5)'
        )
        parser.add_argument(
            '--elevation-only',
            action='store_true',
            help='Only update elevation data, skip geocoding'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        location_id = options['id']
        location_type = options['type']
        delay = options['delay']
        elevation_only = options['elevation_only']

        # Build queryset
        queryset = Location.objects.all()

        if location_id:
            queryset = queryset.filter(id=location_id)
        if location_type:
            queryset = queryset.filter(location_type=location_type)

        locations = queryset.order_by('id')
        total = locations.count()

        if total == 0:
            self.stdout.write(self.style.WARNING('No locations found matching criteria'))
            return

        self.stdout.write(f'\n{"=" * 60}')
        mode_flags = []
        if dry_run:
            mode_flags.append('DRY RUN')
        if elevation_only:
            mode_flags.append('ELEVATION ONLY')
        mode_str = f' ({", ".join(mode_flags)})' if mode_flags else ''
        self.stdout.write(f'LOCATION ENRICHMENT{mode_str}')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'Locations to process: {total}')
        self.stdout.write(f'Delay between calls: {delay}s')
        self.stdout.write('')

        success_count = 0
        geocode_failed = 0
        elevation_failed = 0

        for i, location in enumerate(locations, 1):
            self.stdout.write(f'[{i}/{total}] {location.name} (ID: {location.id})')
            self.stdout.write(f'  Coords: {location.latitude}, {location.longitude}')
            self.stdout.write(f'  Before: {location.formatted_address or "(empty)"}, {location.elevation}m')

            if dry_run:
                self.stdout.write(self.style.WARNING('  Skipped (dry run)'))
                continue

            # Run geocoding (skip if elevation_only)
            geocode_success = False
            if not elevation_only:
                try:
                    geocode_success = LocationService.update_address_from_coordinates(location)
                    if geocode_success:
                        location.refresh_from_db()
                        self.stdout.write(self.style.SUCCESS(
                            f'  Geocoded: {location.formatted_address}'
                        ))
                    else:
                        self.stdout.write(self.style.WARNING('  Geocoding: No data returned'))
                        geocode_failed += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Geocoding error: {e}'))
                    geocode_failed += 1

                time.sleep(delay)

            # Run elevation
            elevation_success = False
            try:
                elevation_success = LocationService.update_elevation_from_mapbox(location)
                if elevation_success:
                    location.refresh_from_db()
                    self.stdout.write(self.style.SUCCESS(
                        f'  Elevation: {location.elevation}m'
                    ))
                else:
                    self.stdout.write(self.style.WARNING('  Elevation: No data returned'))
                    elevation_failed += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  Elevation error: {e}'))
                elevation_failed += 1

            if geocode_success or elevation_success:
                success_count += 1

            time.sleep(delay)

        # Summary
        self.stdout.write(f'\n{"=" * 60}')
        self.stdout.write('ENRICHMENT COMPLETE')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'  Total processed: {total}')
        if not dry_run:
            self.stdout.write(f'  Successful: {success_count}')
            if elevation_only:
                self.stdout.write('  Geocoding: skipped')
            else:
                self.stdout.write(f'  Geocoding failed: {geocode_failed}')
            self.stdout.write(f'  Elevation failed: {elevation_failed}')
        self.stdout.write('')
