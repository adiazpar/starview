# ----------------------------------------------------------------------------------------------------- #
# Django Management Command - Audit Archive Cleanup                                                     #
#                                                                                                       #
# Purpose:                                                                                              #
# Deletes audit log archives from R2 storage that are older than the retention period (default 90      #
# days). Ensures compliance with privacy policy data retention commitments.                             #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py cleanup_audit_archives [options]                                                   #
#                                                                                                       #
# Options:                                                                                              #
#   --days N      Delete archives older than N days (default: 90)                                       #
#   --dry-run     Show what would be deleted without making changes                                     #
# ----------------------------------------------------------------------------------------------------- #

import re
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone
import boto3
from botocore.exceptions import ClientError


class Command(BaseCommand):
    help = 'Delete audit log archives from R2 older than retention period (default 90 days)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='Delete archives older than N days (default: 90)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without making changes',
        )

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.retention_days = options['days']

        # Only run in production (R2 storage)
        if settings.DEBUG:
            self.stdout.write(self.style.WARNING(
                'Development mode: This command only cleans up R2 archives in production.\n'
                'Local archives in ./audit_archives/ should be cleaned up manually if needed.'
            ))
            return

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made\n'))

        # Get R2 credentials (use dedicated audit credentials if available)
        access_key = getattr(settings, 'AUDIT_R2_ACCESS_KEY_ID', None) or settings.AWS_ACCESS_KEY_ID
        secret_key = getattr(settings, 'AUDIT_R2_SECRET_ACCESS_KEY', None) or settings.AWS_SECRET_ACCESS_KEY
        bucket_name = getattr(settings, 'AUDIT_R2_BUCKET_NAME', None) or settings.AWS_STORAGE_BUCKET_NAME

        self.stdout.write(f'Connecting to R2 bucket: {bucket_name}')
        self.stdout.write(f'Retention period: {self.retention_days} days\n')

        # Initialize R2 client
        self.r2_client = boto3.client(
            's3',
            endpoint_url=f'https://{settings.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name='auto'
        )

        # Calculate cutoff date
        cutoff_date = timezone.now() - timedelta(days=self.retention_days)
        self.stdout.write(f'Cutoff date: {cutoff_date.strftime("%Y-%m-%d")} (files older than this will be deleted)\n')

        # List and filter archives
        try:
            response = self.r2_client.list_objects_v2(
                Bucket=bucket_name,
                Prefix='audit-archives/'
            )
        except ClientError as e:
            self.stdout.write(self.style.ERROR(f'Failed to list R2 objects: {e}'))
            return

        if 'Contents' not in response:
            self.stdout.write(self.style.SUCCESS('No audit archives found in R2.'))
            return

        # Parse archive filenames to extract dates
        # Format: audit_logs_YYYYMMDD_to_YYYYMMDD_YYYYMMDD_HHMMSS.json
        archives_to_delete = []
        archives_to_keep = []

        for obj in response['Contents']:
            key = obj['Key']
            # Extract the archive creation timestamp from filename
            # Pattern: audit_logs_..._YYYYMMDD_HHMMSS.json or .txt
            match = re.search(r'_(\d{8})_(\d{6})\.(json|txt)$', key)

            if match:
                date_str = match.group(1)  # YYYYMMDD
                try:
                    archive_date = datetime.strptime(date_str, '%Y%m%d')
                    archive_date = timezone.make_aware(archive_date)

                    if archive_date < cutoff_date:
                        archives_to_delete.append({
                            'key': key,
                            'date': archive_date,
                            'size': obj['Size']
                        })
                    else:
                        archives_to_keep.append({
                            'key': key,
                            'date': archive_date
                        })
                except ValueError:
                    self.stdout.write(self.style.WARNING(f'Could not parse date from: {key}'))
            else:
                self.stdout.write(self.style.WARNING(f'Unexpected filename format: {key}'))

        # Report findings
        self.stdout.write(f'Archives to keep: {len(archives_to_keep)}')
        self.stdout.write(f'Archives to delete: {len(archives_to_delete)}\n')

        if not archives_to_delete:
            self.stdout.write(self.style.SUCCESS('No archives older than retention period.'))
            return

        # Delete old archives
        deleted_count = 0
        deleted_size = 0

        for archive in archives_to_delete:
            size_kb = archive['size'] / 1024
            age_days = (timezone.now() - archive['date']).days

            if self.dry_run:
                self.stdout.write(f"  [DRY RUN] Would delete: {archive['key']} ({size_kb:.1f} KB, {age_days} days old)")
            else:
                try:
                    self.r2_client.delete_object(Bucket=bucket_name, Key=archive['key'])
                    self.stdout.write(f"  Deleted: {archive['key']} ({size_kb:.1f} KB, {age_days} days old)")
                    deleted_count += 1
                    deleted_size += archive['size']
                except ClientError as e:
                    self.stdout.write(self.style.ERROR(f"  Failed to delete {archive['key']}: {e}"))

        # Summary
        self.stdout.write('')
        if self.dry_run:
            total_size = sum(a['size'] for a in archives_to_delete) / 1024
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] Would delete {len(archives_to_delete)} archives ({total_size:.1f} KB)'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Deleted {deleted_count} archives ({deleted_size / 1024:.1f} KB)'
            ))
