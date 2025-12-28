"""
Cache Pre-Warming Management Command

Pre-warms Redis caches after deployment to eliminate cold-start latency.
Warms anonymous caches for: map markers, location list pages, platform stats.

Usage:
    python manage.py warm_cache           # Warm all caches
    python manage.py warm_cache --dry-run # Preview what would be cached
    python manage.py warm_cache --pages 3 # Only warm first 3 list pages
"""

import time

from django.core.management.base import BaseCommand
from django.test import RequestFactory
from django.contrib.auth.models import AnonymousUser

from starview_app.views import LocationViewSet, get_platform_stats
from starview_app.utils.cache import (
    map_geojson_key,
    location_list_key,
)


class Command(BaseCommand):
    help = 'Pre-warm application caches to eliminate cold-start latency'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be cached without actually caching'
        )
        parser.add_argument(
            '--pages',
            type=int,
            default=5,
            help='Number of location list pages to warm (default: 5)'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        pages = options['pages']

        if dry_run:
            self._dry_run(pages)
        else:
            self._warm_caches(pages)

    def _dry_run(self, pages):
        """Preview what caches would be warmed."""
        self.stdout.write('\n[DRY RUN] Would warm the following caches:\n')

        # Map GeoJSON
        self.stdout.write(f'  - {map_geojson_key()} (30 min TTL)')

        # Location list pages
        for page in range(1, pages + 1):
            self.stdout.write(f'  - {location_list_key(page)} (15 min TTL)')

        # Platform stats
        self.stdout.write('  - platform_stats (5 min TTL)')

        total = 1 + pages + 1  # markers + pages + stats
        self.stdout.write(f'\nTotal: {total} cache entries\n')

    def _warm_caches(self, pages):
        """Actually warm the caches."""
        self.stdout.write('\nWarming application caches...\n')

        factory = RequestFactory()
        total_start = time.time()
        caches_warmed = 0
        errors = []

        # 1. Warm map GeoJSON (anonymous)
        self.stdout.write('\n  [1/3] Map GeoJSON (anonymous)')
        try:
            start = time.time()
            request = factory.get('/api/locations/map_geojson/')
            request.user = AnonymousUser()

            viewset = LocationViewSet.as_view({'get': 'map_geojson'})
            response = viewset(request)

            elapsed = time.time() - start
            features = response.data.get('features', []) if hasattr(response, 'data') else []
            count = len(features)
            self.stdout.write(
                self.style.SUCCESS(f'        Cached {count:,} locations in {elapsed:.2f}s')
            )
            caches_warmed += 1
        except Exception as e:
            errors.append(f'Map GeoJSON: {e}')
            self.stdout.write(self.style.ERROR(f'        Failed: {e}'))

        # 2. Warm location list pages (anonymous)
        self.stdout.write(f'\n  [2/3] Location list pages (up to {pages})')
        for page in range(1, pages + 1):
            try:
                start = time.time()
                request = factory.get(f'/api/locations/?page={page}')
                request.user = AnonymousUser()

                viewset = LocationViewSet.as_view({'get': 'list'})
                response = viewset(request)

                elapsed = time.time() - start
                data = response.data if hasattr(response, 'data') else {}
                results = data.get('results', [])
                count = len(results)
                self.stdout.write(
                    self.style.SUCCESS(f'        Page {page}: {count} locations in {elapsed:.2f}s')
                )
                caches_warmed += 1

                # Stop if this is the last page (no more results)
                if not data.get('next'):
                    if page < pages:
                        self.stdout.write(
                            f'        (reached last page, skipping {pages - page} remaining)'
                        )
                    break
            except Exception as e:
                errors.append(f'Location list page {page}: {e}')
                self.stdout.write(self.style.ERROR(f'        Page {page} failed: {e}'))

        # 3. Warm platform stats
        self.stdout.write('\n  [3/3] Platform stats')
        try:
            start = time.time()
            request = factory.get('/api/stats/')
            request.user = AnonymousUser()

            response = get_platform_stats(request)

            elapsed = time.time() - start
            self.stdout.write(
                self.style.SUCCESS(f'        Cached in {elapsed:.2f}s')
            )
            caches_warmed += 1
        except Exception as e:
            errors.append(f'Platform stats: {e}')
            self.stdout.write(self.style.ERROR(f'        Failed: {e}'))

        # Summary
        total_elapsed = time.time() - total_start
        self.stdout.write('\n' + '-' * 40)

        if errors:
            self.stdout.write(self.style.WARNING(
                f'\nCache warming completed with {len(errors)} error(s)'
            ))
            for error in errors:
                self.stdout.write(self.style.ERROR(f'  - {error}'))
        else:
            self.stdout.write(self.style.SUCCESS('\nCache warming complete!'))

        self.stdout.write(f'  Total time: {total_elapsed:.2f}s')
        self.stdout.write(f'  Caches warmed: {caches_warmed}\n')
