"""
Sync Observatory Metadata Command

One-time command to copy type_metadata (phone, website) from
validated_observatories.json to existing observatory Location records.

Usage:
    python manage.py sync_observatory_metadata
    python manage.py sync_observatory_metadata --dry-run
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from starview_app.models import Location


class Command(BaseCommand):
    help = 'Sync type_metadata from validated_observatories.json to existing observatories'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Load enriched JSON
        json_path = Path(settings.BASE_DIR) / 'seed_data' / 'validated_observatories.json'
        if not json_path.exists():
            self.stdout.write(self.style.ERROR(f'File not found: {json_path}'))
            return

        with open(json_path) as f:
            data = json.load(f)

        observatories = data.get('observatories', [])

        # Build lookup by name (normalized)
        json_lookup = {}
        for obs in observatories:
            if obs.get('type_metadata'):
                name = obs['name'].lower().strip()
                json_lookup[name] = obs['type_metadata']

        self.stdout.write(f'\n{"=" * 60}')
        self.stdout.write(f'SYNC OBSERVATORY METADATA {"(DRY RUN)" if dry_run else ""}')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'Observatories in JSON with metadata: {len(json_lookup)}')

        # Get existing observatories from DB
        db_observatories = Location.objects.filter(location_type='observatory')
        total = db_observatories.count()
        self.stdout.write(f'Observatories in database: {total}\n')

        updated = 0
        already_has = 0
        no_match = 0

        for location in db_observatories:
            name_key = location.name.lower().strip()

            if name_key in json_lookup:
                json_metadata = json_lookup[name_key]
                existing_metadata = location.type_metadata or {}

                # Check if already has this data
                if existing_metadata.get('website') and existing_metadata.get('phone_number'):
                    self.stdout.write(f'  {location.name}: already has metadata')
                    already_has += 1
                    continue

                # Merge metadata (don't overwrite existing)
                new_metadata = dict(existing_metadata)
                for key, value in json_metadata.items():
                    if key not in new_metadata:
                        new_metadata[key] = value

                if dry_run:
                    self.stdout.write(f'  {location.name}: would add {json_metadata}')
                else:
                    location.type_metadata = new_metadata
                    location.save(update_fields=['type_metadata'])
                    self.stdout.write(self.style.SUCCESS(f'  {location.name}: updated'))

                updated += 1
            else:
                self.stdout.write(self.style.WARNING(f'  {location.name}: no match in JSON'))
                no_match += 1

        # Summary
        self.stdout.write(f'\n{"=" * 60}')
        self.stdout.write('SYNC COMPLETE')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'  Updated: {updated}')
        self.stdout.write(f'  Already had metadata: {already_has}')
        self.stdout.write(f'  No match in JSON: {no_match}')
        self.stdout.write('')
