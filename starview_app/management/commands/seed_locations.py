"""
Location Seeding Management Command

Seeds the database with curated locations from validated JSON files.
Prioritizes local temp files (from validation phase) to avoid re-downloading.
Falls back to URL download if local file not found.

Usage:
    python manage.py seed_locations --type=observatory
    python manage.py seed_locations --type=observatory --dry-run
    python manage.py seed_locations --type=observatory --skip-images

Prerequisites:
    Run the observatory seeder pipeline first:
    python -m tools.observatory_seeder.run --discover --download --limit N
    Then validate images with Claude Code and generate validated_observatories.json
"""

import json
import re
import time
from pathlib import Path

import requests

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

# Retry settings for downloads (infinite retries for recoverable errors)
BASE_RETRY_DELAY = 10  # Starting delay in seconds
MAX_RETRY_DELAY = 300  # Cap at 5 minutes between retries
RATE_LIMIT_COOLDOWN = 180  # 3 minutes for 429 errors

# Non-recoverable HTTP status codes (don't retry these)
NON_RECOVERABLE_STATUSES = {400, 401, 403, 404, 410, 451}


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
        parser.add_argument(
            '--skip-existing',
            action='store_true',
            default=True,
            help='Skip locations that already exist (default: True)'
        )
        parser.add_argument(
            '--verify',
            action='store_true',
            default=False,
            help='Mark seeded locations as verified (default: False)'
        )

    def handle(self, *args, **options):
        location_type = options['type']
        dry_run = options['dry_run']
        skip_images = options['skip_images']
        skip_existing = options['skip_existing']
        verify = options['verify']

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
        self.stdout.write(f'Skip existing: {skip_existing}')
        self.stdout.write(f'Mark as verified: {verify}')

        if dry_run:
            self._dry_run(locations, location_type)
        else:
            self._seed_locations(
                locations,
                location_type,
                skip_images=skip_images,
                skip_existing=skip_existing,
                verify=verify
            )

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

    def _seed_locations(
        self,
        locations,
        location_type,
        skip_images=False,
        skip_existing=True,
        verify=True
    ):
        """Seed locations with runtime image downloads."""
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('SEEDING LOCATIONS')
        self.stdout.write('=' * 60)

        total_start = time.time()
        system_user = self._get_or_create_system_user()

        created_count = 0
        skipped_count = 0
        error_count = 0
        images_count = 0
        errors = []

        for i, loc_data in enumerate(locations, 1):
            name = loc_data.get('name', 'Unknown')

            self.stdout.write(f'\n[{i}/{len(locations)}] {name}')

            try:
                # Check if location already exists
                existing = Location.objects.filter(
                    name=name,
                    latitude=loc_data.get('latitude'),
                    longitude=loc_data.get('longitude'),
                ).first()

                if existing and skip_existing:
                    self.stdout.write(self.style.WARNING(f'  Skipped (already exists): ID {existing.id}'))
                    skipped_count += 1
                    continue

                # Build formatted address
                locality = loc_data.get('locality', '')
                admin_area = loc_data.get('administrative_area', '')
                country = loc_data.get('country', '')
                parts = [p for p in [locality, admin_area, country] if p]
                formatted_address = ', '.join(parts)

                # Create location
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
                        is_verified=verify,
                    )

                    self.stdout.write(self.style.SUCCESS(f'  Created: ID {location.id}'))
                    created_count += 1

                    # Download and add image
                    if not skip_images:
                        image_url = loc_data.get('image_url')
                        if image_url:
                            success = self._download_and_add_image(
                                location,
                                image_url,
                                loc_data.get('validation_notes', '')
                            )
                            if success:
                                images_count += 1

            except Exception as e:
                error_count += 1
                errors.append(f'{name}: {e}')
                self.stdout.write(self.style.ERROR(f'  Error: {e}'))

        # Summary
        total_elapsed = time.time() - total_start
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('SEEDING COMPLETE')
        self.stdout.write('=' * 60)
        self.stdout.write(f'  Time elapsed: {total_elapsed:.2f}s')
        self.stdout.write(f'  Locations created: {created_count}')
        self.stdout.write(f'  Locations skipped: {skipped_count}')
        self.stdout.write(f'  Images added: {images_count}')

        if errors:
            self.stdout.write(self.style.ERROR(f'  Errors: {error_count}'))
            for error in errors:
                self.stdout.write(self.style.ERROR(f'    - {error}'))
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
        Download image from URL and add to location with infinite retry logic.

        Retries indefinitely for recoverable errors (network issues, rate limits).
        Only gives up on non-recoverable errors (404, 403, image processing failures).
        Uses exponential backoff capped at MAX_RETRY_DELAY.
        """
        self.stdout.write(f'  Downloading image from URL...')

        attempt = 0
        while True:
            attempt += 1
            try:
                # Download image
                response = requests.get(
                    image_url,
                    headers={'User-Agent': USER_AGENT},
                    timeout=60
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
                image_bytes = response.content

                # Get original filename extension from URL
                from urllib.parse import urlparse, unquote
                url_path = unquote(urlparse(image_url).path)
                ext = url_path.split('.')[-1].lower() if '.' in url_path else 'jpg'
                filename = f'{location.id}_01.{ext}'

                # Create LocationPhoto with image assigned (not saved yet)
                # LocationPhoto.save() will handle all processing and create only one file
                photo = LocationPhoto(
                    location=location,
                    caption=caption[:255] if caption else '',
                    order=0,
                    image=ContentFile(image_bytes, name=filename),
                )
                photo.save()

                size_kb = len(image_bytes) / 1024
                if attempt > 1:
                    self.stdout.write(f'    Added image: {filename} ({size_kb:.0f}KB) [after {attempt} attempts]')
                else:
                    self.stdout.write(f'    Added image: {filename} ({size_kb:.0f}KB)')

                time.sleep(IMAGE_DOWNLOAD_DELAY)
                return True

            except requests.exceptions.RequestException as e:
                # Network errors - retry with exponential backoff
                delay = min(BASE_RETRY_DELAY * (2 ** (attempt - 1)), MAX_RETRY_DELAY)
                self.stdout.write(self.style.WARNING(
                    f'    Network error: {e}. Retrying in {delay}s (attempt #{attempt + 1})...'
                ))
                time.sleep(delay)
                continue

            except Exception as e:
                # Non-network errors (image processing, etc.) - don't retry
                self.stdout.write(self.style.ERROR(f'    Image processing error: {e}'))
                return False
