"""
Location Seeding Management Command

Seeds the database with curated locations from validated JSON files.
Downloads images from URLs and creates Location records.

Usage:
    python manage.py seed_locations --type=observatory
    python manage.py seed_locations --type=observatory --dry-run

Behavior:
    - Idempotent: Skips locations that already exist (by name + coordinates)
    - Seeded locations are NOT verified (verification through normal flow)
    - If image download fails, location is NOT created (retried on next run)
    - type_metadata (phone, website) is read from JSON if present

Prerequisites:
    Run /seed-observatories skill which handles:
    1. Discovery from Wikidata (with phone/website enrichment)
    2. Image validation via sub-agents
    3. Generates validated_observatories.json
"""

import gc
import io
import json
import os
import re
import tempfile
import time
from pathlib import Path

import requests
from PIL import Image

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from starview_app.models import Location, LocationPhoto
from starview_app.utils import invalidate_location_list, invalidate_map_geojson

# Path to temp directory with validated images
TEMP_DIR = Path(settings.BASE_DIR) / 'seed_data' / 'temp'

User = get_user_model()

# System user for seeded content
SYSTEM_USER_USERNAME = 'starview'
SYSTEM_USER_EMAIL = 'system@starview.app'

# Valid location types (must match model choices)
VALID_LOCATION_TYPES = ['observatory', 'dark_sky_site', 'campground', 'viewpoint', 'other']

# Image download settings
USER_AGENT = 'StarviewApp/1.0 (https://starview.app; seeding)'
IMAGE_DOWNLOAD_DELAY = 2.0  # Seconds between downloads
MAX_IMAGE_DIMENSION = 1920  # Resize images to this max dimension before saving
JPEG_QUALITY = 85  # Quality for resized JPEG images

# Retry settings for downloads (infinite retries for recoverable errors)
BASE_RETRY_DELAY = 10  # Starting delay in seconds
MAX_RETRY_DELAY = 300  # Cap at 5 minutes between retries
RATE_LIMIT_COOLDOWN = 180  # 3 minutes for 429 errors

# Non-recoverable HTTP status codes (don't retry these)
NON_RECOVERABLE_STATUSES = {400, 401, 403, 404, 410, 451}


class ImageDownloadFailed(Exception):
    """Raised when image download fails, triggering transaction rollback."""
    pass


class Command(BaseCommand):
    help = 'Seed locations from validated JSON data files'

    def add_arguments(self, parser):
        parser.add_argument(
            '--type',
            type=str,
            required=True,
            choices=VALID_LOCATION_TYPES,
            help='Type of locations to seed (e.g., observatory)'
        )
        parser.add_argument(
            '--file',
            type=str,
            help='Path to JSON file (default: seed_data/validated_{type}s.json)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without making changes'
        )
        parser.add_argument(
            '--skip-images',
            action='store_true',
            help='Skip image processing (faster for testing)'
        )

    def handle(self, *args, **options):
        location_type = options['type']
        dry_run = options['dry_run']
        skip_images = options['skip_images']


        # Determine JSON file path
        if options['file']:
            json_path = Path(options['file'])
        else:
            # Handle irregular plurals
            plural = 'observatories' if location_type == 'observatory' else f'{location_type}s'
            json_path = Path(settings.BASE_DIR) / 'seed_data' / f'validated_{plural}.json'

        # Validate file exists
        if not json_path.exists():
            self.stdout.write(self.style.ERROR(f'\nError: File not found: {json_path}'))
            self.stdout.write('\nHave you run the observatory seeder pipeline?')
            self.stdout.write('  python -m tools.observatory_seeder.run --discover --download --limit N')
            self.stdout.write('  Then validate images and generate validated_observatories.json\n')
            return

        # Load seed data
        self.stdout.write(f'\nLoading seed data from: {json_path}')
        with open(json_path) as f:
            seed_data = json.load(f)

        # Support both 'locations' and 'observatories' keys
        locations = seed_data.get('observatories', seed_data.get('locations', []))
        if not locations:
            self.stdout.write(self.style.WARNING('No locations found in seed file'))
            return

        self.stdout.write(f'Found {len(locations)} locations to seed')
        self.stdout.write(f'Location type: {location_type}')
        self.stdout.write(f'Dry run: {dry_run}')
        self.stdout.write(f'Skip images: {skip_images}')

        if dry_run:
            self._dry_run(locations, location_type)
        else:
            self._seed_locations(locations, location_type, skip_images=skip_images)

    def _dry_run(self, locations, location_type):
        """Preview what would be seeded."""
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('[DRY RUN] Would create the following locations:')
        self.stdout.write('=' * 60)

        for loc in locations:
            name = loc.get('name', 'Unknown')
            slug = loc.get('slug', 'unknown')
            lat = loc.get('latitude', 0)
            lng = loc.get('longitude', 0)
            image_url = loc.get('image_url')

            self.stdout.write(f'\n  {name}')
            self.stdout.write(f'    Slug: {slug}')
            self.stdout.write(f'    Coordinates: {lat}, {lng}')
            self.stdout.write(f'    Type: {location_type}')
            self.stdout.write(f'    Image URL: {"Yes" if image_url else "No"}')

        self.stdout.write('\n' + '-' * 60)
        self.stdout.write(f'Total: {len(locations)} locations would be created')
        self.stdout.write('Run without --dry-run to actually seed the database\n')

    def _get_or_create_system_user(self):
        """Get or create the Starview system user for seeded content."""
        user, created = User.objects.get_or_create(
            username=SYSTEM_USER_USERNAME,
            defaults={
                'email': SYSTEM_USER_EMAIL,
                'is_active': True,
                'is_staff': False,
            }
        )

        if created:
            user.set_unusable_password()
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created system user: {SYSTEM_USER_USERNAME}'))
        else:
            self.stdout.write(f'Using existing system user: {SYSTEM_USER_USERNAME}')

        return user

    def _seed_locations(self, locations, location_type, skip_images=False):
        """Seed locations with runtime image downloads."""
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('SEEDING LOCATIONS')
        self.stdout.write('=' * 60)

        total_start = time.time()
        system_user = self._get_or_create_system_user()

        created_count = 0
        skipped_count = 0
        deferred_count = 0
        error_count = 0
        images_count = 0
        errors = []

        for i, loc_data in enumerate(locations, 1):
            name = loc_data.get('name', 'Unknown')

            self.stdout.write(f'\n[{i}/{len(locations)}] {name}')

            try:
                # Check if location already exists (by name + truncated coordinates)
                # Truncate to 3 decimal places (~111m accuracy) to handle float precision
                # Using floor (truncation) for consistency - always removes extra decimals
                def truncate_coord(val, decimals=3):
                    multiplier = 10 ** decimals
                    return int(val * multiplier) / multiplier

                json_lat = truncate_coord(loc_data.get('latitude', 0))
                json_lng = truncate_coord(loc_data.get('longitude', 0))

                existing = None
                for loc in Location.objects.filter(name__iexact=name):
                    db_lat = truncate_coord(loc.latitude)
                    db_lng = truncate_coord(loc.longitude)
                    if db_lat == json_lat and db_lng == json_lng:
                        existing = loc
                        break

                if existing:
                    self.stdout.write(self.style.WARNING(f'  Skipped (already exists): ID {existing.id}'))
                    skipped_count += 1
                    continue

                # Build formatted address
                locality = loc_data.get('locality', '')
                admin_area = loc_data.get('administrative_area', '')
                country = loc_data.get('country', '')
                parts = [p for p in [locality, admin_area, country] if p]
                formatted_address = ', '.join(parts)

                # Create location (rolled back if image download fails)
                with transaction.atomic():
                    location = Location.objects.create(
                        name=name,
                        location_type=location_type,
                        latitude=loc_data.get('latitude'),
                        longitude=loc_data.get('longitude'),
                        elevation=loc_data.get('elevation') or 0,
                        country=country,
                        administrative_area=admin_area,
                        locality=locality,
                        formatted_address=formatted_address,
                        added_by=system_user,
                        is_verified=False,  # Verification happens through normal flow
                        type_metadata=loc_data.get('type_metadata') or {},
                    )

                    # Download and add image - rollback location if image fails
                    if not skip_images:
                        image_url = loc_data.get('image_url')
                        if not image_url:
                            # No image URL in JSON - skip this location entirely
                            self.stdout.write(self.style.WARNING(
                                f'  Skipped: No image_url in JSON'
                            ))
                            deferred_count += 1
                            raise ImageDownloadFailed(name)

                        success = self._download_and_add_image(
                            location,
                            image_url,
                            loc_data.get('validation_notes', '')
                        )
                        if not success:
                            # Rollback: don't create location without image
                            # This allows retry on next run
                            self.stdout.write(self.style.WARNING(
                                f'  Deferred: Image failed, will retry on next run'
                            ))
                            deferred_count += 1
                            raise ImageDownloadFailed(name)
                        images_count += 1

                    self.stdout.write(self.style.SUCCESS(f'  Created: ID {location.id}'))
                    created_count += 1

            except ImageDownloadFailed:
                # Already logged and counted as deferred - transaction rolled back
                pass

            except Exception as e:
                error_count += 1
                errors.append(f'{name}: {e}')
                self.stdout.write(self.style.ERROR(f'  Error: {e}'))

            # Force garbage collection after each location to prevent OOM on 512MB instances
            gc.collect()

        # Summary
        total_elapsed = time.time() - total_start
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('SEEDING COMPLETE')
        self.stdout.write('=' * 60)
        self.stdout.write(f'  Time elapsed: {total_elapsed:.2f}s')
        self.stdout.write(f'  Locations created: {created_count}')
        self.stdout.write(f'  Locations skipped: {skipped_count}')
        if deferred_count > 0:
            self.stdout.write(self.style.WARNING(f'  Locations deferred: {deferred_count} (will retry on next run)'))
        self.stdout.write(f'  Images added: {images_count}')

        if errors:
            self.stdout.write(self.style.ERROR(f'  Errors: {error_count}'))
            for error in errors:
                self.stdout.write(self.style.ERROR(f'    - {error}'))
        elif deferred_count > 0:
            self.stdout.write(self.style.WARNING('  Run again later to retry deferred locations'))
        else:
            self.stdout.write(self.style.SUCCESS('  No errors!'))

        # Invalidate caches so new locations appear immediately
        if created_count > 0:
            invalidate_location_list()
            invalidate_map_geojson()
            self.stdout.write('  Caches invalidated (location list + map GeoJSON)')

        self.stdout.write('')

    def _name_to_slug(self, name):
        """Generate a URL-friendly slug from the name (matches observatory_seeder)."""
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug)
        slug = re.sub(r'[\s_]+', '-', slug)
        slug = re.sub(r'-+', '-', slug)
        return slug.strip('-')[:50]

    def _get_local_image(self, name):
        """Check if validated image exists in temp directory."""
        slug = self._name_to_slug(name)
        local_path = TEMP_DIR / slug / '01.jpg'

        if local_path.exists():
            return local_path
        return None

    def _download_and_add_image(self, location, image_url, caption=''):
        """
        Download image from URL, resize it, and add to location.

        Pre-resizes images to MAX_IMAGE_DIMENSION before saving to LocationPhoto.
        This reduces memory usage during LocationPhoto's PIL processing, preventing
        OOM crashes on 512MB Render instances.

        Retries indefinitely for recoverable errors (network issues, rate limits).
        Only gives up on non-recoverable errors (404, 403, image processing failures).
        """
        self.stdout.write(f'  Downloading image from URL...')

        attempt = 0
        while True:
            attempt += 1
            tmp_path = None
            try:
                # Download image (stream=True to avoid loading entire file in memory)
                response = requests.get(
                    image_url,
                    headers={'User-Agent': USER_AGENT},
                    timeout=(10, 120),  # (connect, read) - longer read for large files
                    stream=True
                )

                # Handle rate limiting (429) - always retry
                if response.status_code == 429:
                    self.stdout.write(self.style.WARNING(
                        f'    Rate limited (429). Waiting {RATE_LIMIT_COOLDOWN}s before retry #{attempt + 1}...'
                    ))
                    time.sleep(RATE_LIMIT_COOLDOWN)
                    continue

                # Non-recoverable HTTP errors - give up
                if response.status_code in NON_RECOVERABLE_STATUSES:
                    self.stdout.write(self.style.ERROR(
                        f'    Non-recoverable HTTP {response.status_code}. Skipping image.'
                    ))
                    return False

                response.raise_for_status()

                # Stream to temp file
                with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as tmp_file:
                    tmp_path = tmp_file.name
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            tmp_file.write(chunk)

                # Open image with PIL and resize to reduce memory usage
                # This pre-processing means LocationPhoto._process_image() works on a smaller image
                img = Image.open(tmp_path)

                # Convert to RGB if necessary (handles PNG/RGBA)
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (0, 0, 0))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                # Resize to max dimension (maintains aspect ratio)
                img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

                # Save resized image to BytesIO
                img_io = io.BytesIO()
                img.save(img_io, format='JPEG', quality=JPEG_QUALITY, optimize=True)
                resized_size = img_io.tell()
                img_io.seek(0)

                # Clean up PIL image to free memory
                img.close()
                del img

                # Clean up temp file
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                    tmp_path = None

                # Create LocationPhoto with pre-resized image
                filename = f'{location.id}_01.jpg'
                photo = LocationPhoto(
                    location=location,
                    caption=caption[:255] if caption else '',
                    order=0,
                    image=ContentFile(img_io.read(), name=filename),
                )
                photo.save()

                # Clean up
                img_io.close()
                del img_io
                gc.collect()

                size_kb = resized_size / 1024
                if attempt > 1:
                    self.stdout.write(f'    Added image: {filename} ({size_kb:.0f}KB) [after {attempt} attempts]')
                else:
                    self.stdout.write(f'    Added image: {filename} ({size_kb:.0f}KB)')

                time.sleep(IMAGE_DOWNLOAD_DELAY)
                return True

            except requests.exceptions.RequestException as e:
                # Network errors - retry with exponential backoff
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                delay = min(BASE_RETRY_DELAY * (2 ** (attempt - 1)), MAX_RETRY_DELAY)
                self.stdout.write(self.style.WARNING(
                    f'    Network error: {e}. Retrying in {delay}s (attempt #{attempt + 1})...'
                ))
                time.sleep(delay)
                continue

            except Exception as e:
                # Non-network errors (image processing, etc.) - don't retry
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                self.stdout.write(self.style.ERROR(f'    Image processing error: {e}'))
                gc.collect()
                return False
