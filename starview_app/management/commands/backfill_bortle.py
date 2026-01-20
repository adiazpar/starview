"""
Management command to backfill Bortle data for existing locations.

This command updates all locations that don't have bortle_class data by
sampling the World Atlas 2015 GeoTIFF file for their coordinates.

Usage:
    djvenv/bin/python manage.py backfill_bortle           # Run backfill
    djvenv/bin/python manage.py backfill_bortle --dry-run # Preview changes
"""
from django.core.management.base import BaseCommand
from starview_app.models import Location
from starview_app.services.location_service import LocationService


class Command(BaseCommand):
    help = 'Backfill Bortle class for existing locations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )

    def handle(self, *args, **options):
        locations = Location.objects.filter(bortle_class__isnull=True)
        total = locations.count()

        self.stdout.write(f"Found {total} locations without Bortle data")

        if options['dry_run']:
            self.stdout.write(self.style.WARNING("Dry run - no changes made"))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS("All locations already have Bortle data"))
            return

        updated = 0
        failed = 0

        for i, location in enumerate(locations, 1):
            try:
                if LocationService.update_bortle_from_coordinates(location):
                    updated += 1
                    self.stdout.write(
                        f"  [{i}/{total}] {location.name}: Bortle {location.bortle_class}"
                    )
                else:
                    failed += 1
                    self.stdout.write(
                        self.style.WARNING(f"  [{i}/{total}] {location.name}: No data available")
                    )
            except Exception as e:
                failed += 1
                self.stdout.write(
                    self.style.ERROR(f"  [{i}/{total}] {location.name}: Error - {e}")
                )

            # Progress update every 10 locations
            if i % 10 == 0:
                self.stdout.write(f"Progress: {i}/{total} processed")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Completed: {updated} updated, {failed} failed"))
