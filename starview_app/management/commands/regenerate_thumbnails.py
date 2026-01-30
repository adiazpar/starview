"""
Management command to regenerate thumbnails for existing photos.

This command regenerates thumbnails at 720x720 resolution for LocationPhoto
and ReviewPhoto records. Useful after changing thumbnail dimensions.

Usage:
    djvenv/bin/python manage.py regenerate_thumbnails                    # Regenerate all
    djvenv/bin/python manage.py regenerate_thumbnails --dry-run          # Preview only
    djvenv/bin/python manage.py regenerate_thumbnails --location-id 123  # Single location
    djvenv/bin/python manage.py regenerate_thumbnails --type location    # Location photos only
    djvenv/bin/python manage.py regenerate_thumbnails --type review      # Review photos only
    djvenv/bin/python manage.py regenerate_thumbnails --limit 10         # Process only 10
"""
from django.core.management.base import BaseCommand
from django.core.files.uploadedfile import InMemoryUploadedFile
from starview_app.models import LocationPhoto, ReviewPhoto
from PIL import Image
import io
import os


THUMBNAIL_SIZE = (720, 720)
THUMBNAIL_QUALITY = 85


class Command(BaseCommand):
    help = 'Regenerate thumbnails for existing photos at 720x720 resolution'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )
        parser.add_argument(
            '--location-id',
            type=int,
            help='Only regenerate thumbnails for a specific location ID'
        )
        parser.add_argument(
            '--type',
            choices=['location', 'review', 'all'],
            default='all',
            help='Type of photos to process (default: all)'
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Limit the number of photos to process'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        location_id = options['location_id']
        photo_type = options['type']
        limit = options['limit']

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be made\n"))

        total_updated = 0
        total_failed = 0

        # Process location photos
        if photo_type in ['location', 'all']:
            updated, failed = self._process_location_photos(
                dry_run=dry_run,
                location_id=location_id,
                limit=limit
            )
            total_updated += updated
            total_failed += failed

        # Process review photos
        if photo_type in ['review', 'all'] and not location_id:
            remaining_limit = None
            if limit:
                remaining_limit = max(0, limit - total_updated - total_failed)
                if remaining_limit == 0:
                    self.stdout.write("Limit reached, skipping review photos")
                else:
                    updated, failed = self._process_review_photos(
                        dry_run=dry_run,
                        limit=remaining_limit
                    )
                    total_updated += updated
                    total_failed += failed
            else:
                updated, failed = self._process_review_photos(dry_run=dry_run, limit=None)
                total_updated += updated
                total_failed += failed

        # Final summary
        self.stdout.write("")
        self.stdout.write("=" * 50)
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"DRY RUN COMPLETE: Would update {total_updated} thumbnails"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"COMPLETE: {total_updated} updated, {total_failed} failed"
            ))

    def _process_location_photos(self, dry_run, location_id=None, limit=None):
        """Process LocationPhoto thumbnails."""
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("Processing LOCATION PHOTOS")
        self.stdout.write("=" * 50)

        queryset = LocationPhoto.objects.select_related('location').all()

        if location_id:
            queryset = queryset.filter(location_id=location_id)
            self.stdout.write(f"Filtering to location ID: {location_id}")

        if limit:
            queryset = queryset[:limit]

        photos = list(queryset)
        total = len(photos)

        if total == 0:
            self.stdout.write("No location photos found")
            return 0, 0

        self.stdout.write(f"Found {total} location photos to process\n")

        updated = 0
        failed = 0

        for i, photo in enumerate(photos, 1):
            success = self._regenerate_thumbnail(
                photo=photo,
                photo_type='location',
                index=i,
                total=total,
                dry_run=dry_run
            )
            if success:
                updated += 1
            else:
                failed += 1

        self.stdout.write(f"\nLocation photos: {updated} updated, {failed} failed")
        return updated, failed

    def _process_review_photos(self, dry_run, limit=None):
        """Process ReviewPhoto thumbnails."""
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("Processing REVIEW PHOTOS")
        self.stdout.write("=" * 50)

        queryset = ReviewPhoto.objects.select_related('review', 'review__location').all()

        if limit:
            queryset = queryset[:limit]

        photos = list(queryset)
        total = len(photos)

        if total == 0:
            self.stdout.write("No review photos found")
            return 0, 0

        self.stdout.write(f"Found {total} review photos to process\n")

        updated = 0
        failed = 0

        for i, photo in enumerate(photos, 1):
            success = self._regenerate_thumbnail(
                photo=photo,
                photo_type='review',
                index=i,
                total=total,
                dry_run=dry_run
            )
            if success:
                updated += 1
            else:
                failed += 1

        self.stdout.write(f"\nReview photos: {updated} updated, {failed} failed")
        return updated, failed

    def _regenerate_thumbnail(self, photo, photo_type, index, total, dry_run):
        """Regenerate thumbnail for a single photo."""
        try:
            # Get location name for logging
            if photo_type == 'location':
                location_name = photo.location.name if photo.location else 'Unknown'
            else:
                location_name = photo.review.location.name if photo.review and photo.review.location else 'Unknown'

            if dry_run:
                self.stdout.write(
                    f"  [{index}/{total}] Would regenerate: Photo {photo.id} ({location_name})"
                )
                return True

            # Open the original image from storage
            photo.image.open('rb')
            img = Image.open(photo.image)

            # Convert to RGB if necessary (for PNG with transparency, etc.)
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')

            # Create thumbnail
            img_copy = img.copy()
            img_copy.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)

            # Save to buffer
            thumb_io = io.BytesIO()
            img_copy.save(thumb_io, format='JPEG', quality=THUMBNAIL_QUALITY, optimize=True)
            file_size = thumb_io.tell()
            thumb_io.seek(0)

            # Generate thumbnail filename
            original_name = os.path.basename(photo.image.name)
            name_without_ext = os.path.splitext(original_name)[0]
            thumb_name = f"{name_without_ext}_thumb.jpg"

            # Delete old thumbnail if exists
            if photo.thumbnail:
                try:
                    photo.thumbnail.delete(save=False)
                except Exception:
                    pass  # Ignore deletion errors

            # Save new thumbnail
            thumb_file = InMemoryUploadedFile(
                thumb_io, None, thumb_name, 'image/jpeg', file_size, None
            )
            photo.thumbnail.save(thumb_name, thumb_file, save=False)
            photo.save(update_fields=['thumbnail'])

            # Clean up
            img.close()
            photo.image.close()

            self.stdout.write(
                f"  [{index}/{total}] Regenerated: Photo {photo.id} ({location_name}) - {img_copy.size[0]}x{img_copy.size[1]}"
            )
            return True

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"  [{index}/{total}] FAILED: Photo {photo.id} - {e}")
            )
            return False
