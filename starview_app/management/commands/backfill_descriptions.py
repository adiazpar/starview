"""
Location Description Backfill Management Command

Backfills Location.description from a pre-generated JSON file containing
AI-generated descriptions for observatory locations.

Usage:
    python manage.py backfill_descriptions
    python manage.py backfill_descriptions --dry-run
    python manage.py backfill_descriptions --file path/to/descriptions.json
    python manage.py backfill_descriptions --overwrite
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Q

from starview_app.models import Location


class Command(BaseCommand):
    help = 'Backfill location descriptions from generated JSON file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes'
        )
        parser.add_argument(
            '--file',
            type=str,
            default='seed_data/observatory_descriptions.json',
            help='Path to the descriptions JSON file (default: seed_data/observatory_descriptions.json)'
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing descriptions (default: skip locations with descriptions)'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        file_path = Path(options['file'])
        overwrite = options['overwrite']

        # Validate file exists
        if not file_path.exists():
            self.stdout.write(self.style.ERROR(f'File not found: {file_path}'))
            self.stdout.write(self.style.WARNING(
                '\nTo generate descriptions, run the /generate-descriptions skill first.'
            ))
            return

        # Load descriptions
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            self.stdout.write(self.style.ERROR(f'Invalid JSON in {file_path}: {e}'))
            return

        descriptions = data.get('descriptions', [])
        if not descriptions:
            self.stdout.write(self.style.WARNING('No descriptions found in file'))
            return

        self.stdout.write(f'\n{"=" * 60}')
        mode = 'DRY RUN' if dry_run else 'LIVE'
        self.stdout.write(f'DESCRIPTION BACKFILL ({mode})')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'Source file: {file_path}')
        self.stdout.write(f'Descriptions to process: {len(descriptions)}')
        self.stdout.write(f'Overwrite existing: {overwrite}')
        self.stdout.write('')

        updated_count = 0
        skipped_existing = 0
        not_found = 0
        errors = []

        for i, entry in enumerate(descriptions, 1):
            name = entry.get('name', '')
            lat = entry.get('latitude')
            lng = entry.get('longitude')
            description = entry.get('description', '')

            if not name or not description:
                errors.append(f"Entry {i}: Missing name or description")
                continue

            # Find matching location by name AND approximate coordinates
            # Use a small tolerance for coordinate matching (0.001 degrees ~ 111 meters)
            # This ensures we match the correct observatory when names are duplicated
            tolerance = 0.001
            location = Location.objects.filter(
                Q(name__iexact=name) &
                Q(latitude__gte=lat - tolerance) &
                Q(latitude__lte=lat + tolerance) &
                Q(longitude__gte=lng - tolerance) &
                Q(longitude__lte=lng + tolerance)
            ).first()

            if not location:
                not_found += 1
                if not_found <= 10:  # Only show first 10 not found
                    self.stdout.write(self.style.WARNING(
                        f'[{i}] Not found: {name} ({lat}, {lng})'
                    ))
                continue

            # Skip if already has description and not overwriting
            if location.description and not overwrite:
                skipped_existing += 1
                continue

            # Update description
            if not dry_run:
                location.description = description
                location.save(update_fields=['description', 'updated_at'])

            updated_count += 1
            if updated_count <= 20:  # Show first 20 updates
                preview = description[:80] + '...' if len(description) > 80 else description
                self.stdout.write(self.style.SUCCESS(
                    f'[{i}] Updated: {location.name}'
                ))
                self.stdout.write(f'    {preview}')

        # Summary
        self.stdout.write(f'\n{"=" * 60}')
        self.stdout.write('BACKFILL COMPLETE')
        self.stdout.write(f'{"=" * 60}')
        self.stdout.write(f'  Total in file: {len(descriptions)}')
        self.stdout.write(f'  Updated: {updated_count}')
        self.stdout.write(f'  Skipped (existing): {skipped_existing}')
        self.stdout.write(f'  Not found in DB: {not_found}')
        if errors:
            self.stdout.write(f'  Errors: {len(errors)}')
            for err in errors[:5]:
                self.stdout.write(self.style.ERROR(f'    {err}'))
        self.stdout.write('')

        if dry_run:
            self.stdout.write(self.style.WARNING(
                'This was a dry run. Run without --dry-run to apply changes.'
            ))
