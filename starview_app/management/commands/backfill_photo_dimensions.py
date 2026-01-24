"""
Management command to backfill dimensions for existing location photos.

This command updates all LocationPhoto records that don't have width/height
by reading the image from storage and extracting dimensions.

Usage:
    djvenv/bin/python manage.py backfill_photo_dimensions           # Run backfill
    djvenv/bin/python manage.py backfill_photo_dimensions --dry-run # Preview changes
"""
from django.core.management.base import BaseCommand
from starview_app.models import LocationPhoto
from PIL import Image
import io


class Command(BaseCommand):
    help = 'Backfill width/height dimensions for existing location photos'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )

    def handle(self, *args, **options):
        photos = LocationPhoto.objects.filter(width__isnull=True)
        total = photos.count()

        self.stdout.write(f"Found {total} photos without dimensions")

        if options['dry_run']:
            self.stdout.write(self.style.WARNING("Dry run - no changes made"))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS("All photos already have dimensions"))
            return

        updated = 0
        failed = 0

        for i, photo in enumerate(photos, 1):
            try:
                # Read image from storage
                photo.image.open('rb')
                img = Image.open(photo.image)
                width, height = img.size
                img.close()
                photo.image.close()

                # Update dimensions
                photo.width = width
                photo.height = height
                photo.save(update_fields=['width', 'height'])

                updated += 1
                self.stdout.write(
                    f"  [{i}/{total}] Photo {photo.id} ({photo.location.name}): {width}x{height}"
                )
            except Exception as e:
                failed += 1
                self.stdout.write(
                    self.style.ERROR(f"  [{i}/{total}] Photo {photo.id}: Error - {e}")
                )

            # Progress update every 50 photos
            if i % 50 == 0:
                self.stdout.write(f"Progress: {i}/{total} processed")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Completed: {updated} updated, {failed} failed"))

        # Summary of high-quality photos
        high_quality = LocationPhoto.objects.filter(width__gte=1200).count()
        self.stdout.write(f"High-quality photos (>=1200px wide): {high_quality}")
