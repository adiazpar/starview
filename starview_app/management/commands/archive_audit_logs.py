# ----------------------------------------------------------------------------------------------------- #
# Django Management Command - Audit Log Archival                                                        #
#                                                                                                       #
# Purpose:                                                                                              #
# Archives old audit logs to files and removes them from the database to manage storage.                #
# Maintains compliance while preventing database bloat in production.                                   #
#                                                                                                       #
# Features:                                                                                             #
# - Archives logs older than specified days (default: 7)                                                #
# - Exports to both JSON (structured) and TXT (human-readable) formats                                  #
# - Organized by date in archive directory                                                              #
# - Bypasses delete protection for archival purposes                                                    #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py archive_audit_logs [options]                                                       #
#                                                                                                       #
# Options:                                                                                              #
#   --days N           Archive logs older than N days (default: 30)                                     #
#   --archive-dir PATH Directory to store archives (default: ./audit_archives)                          #
#   --dry-run          Show what would be archived without making changes                               #
#   --format json|txt|both  Archive format (default: both)                                              #
# ----------------------------------------------------------------------------------------------------- #

import os
import json
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from starview_app.models import AuditLog
import boto3
from botocore.exceptions import ClientError


class Command(BaseCommand):
    help = 'Archive old audit logs to files and remove from database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Archive logs older than N days (default: 30)',
        )
        parser.add_argument(
            '--archive-dir',
            type=str,
            default=os.path.join(settings.BASE_DIR, 'audit_archives'),
            help='Directory to store archives (default: ./audit_archives)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be archived without making changes',
        )
        parser.add_argument(
            '--format',
            type=str,
            choices=['json', 'txt', 'both'],
            default='both',
            help='Archive format (default: both)',
        )


    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.days = options['days']
        self.archive_dir = options['archive_dir']
        self.format = options['format']

        # Determine storage method based on DEBUG setting
        self.use_r2 = not settings.DEBUG

        if self.use_r2:
            # Initialize R2 client with dedicated audit credentials (principle of least privilege)
            # Falls back to main R2 credentials if audit-specific ones not configured
            audit_key_id = getattr(settings, 'AUDIT_R2_ACCESS_KEY_ID', None) or settings.AWS_ACCESS_KEY_ID
            audit_secret = getattr(settings, 'AUDIT_R2_SECRET_ACCESS_KEY', None) or settings.AWS_SECRET_ACCESS_KEY
            self.bucket_name = getattr(settings, 'AUDIT_R2_BUCKET_NAME', None) or settings.AWS_STORAGE_BUCKET_NAME

            using_dedicated_creds = bool(getattr(settings, 'AUDIT_R2_ACCESS_KEY_ID', None))
            creds_info = 'dedicated audit credentials' if using_dedicated_creds else 'shared media credentials (configure AUDIT_R2_* for separation)'
            self.stdout.write(self.style.WARNING(f'Production mode: Archives will be stored in R2 bucket "{self.bucket_name}" using {creds_info}'))

            self.r2_client = boto3.client(
                's3',
                endpoint_url=f'https://{settings.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com',
                aws_access_key_id=audit_key_id,
                aws_secret_access_key=audit_secret,
                region_name='auto'
            )
        else:
            self.stdout.write(self.style.WARNING('Development mode: Archives will be stored locally'))

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Calculate cutoff date
        cutoff_date = timezone.now() - timedelta(days=self.days)

        # Find old logs
        old_logs = AuditLog.objects.filter(timestamp__lt=cutoff_date).order_by('timestamp')
        count = old_logs.count()

        self.stdout.write(f'\nFound {count} audit logs older than {self.days} days')
        self.stdout.write(f'Cutoff date: {cutoff_date.strftime("%Y-%m-%d %H:%M:%S")}')

        if count == 0:
            self.stdout.write(self.style.SUCCESS('\nNo logs to archive'))
            return

        if not self.dry_run:
            if not self.use_r2:
                # Create local archive directory if it doesn't exist
                os.makedirs(self.archive_dir, exist_ok=True)

            # Archive logs
            archived_count = self.archive_logs(old_logs, cutoff_date)

            self.stdout.write(self.style.SUCCESS(f'\nArchived {archived_count} audit logs'))
            if self.use_r2:
                self.stdout.write(f'Archive location: R2 bucket "{self.bucket_name}" in audit-archives/ folder')
            else:
                self.stdout.write(f'Archive location: {self.archive_dir}')
        else:
            self.stdout.write(self.style.WARNING(f'\n[DRY RUN] Would archive {count} logs'))


    # Archive logs to files and delete from database
    def archive_logs(self, logs, cutoff_date):
        # Generate filename with date range
        oldest = logs.first()
        newest = logs.last()
        date_range = f"{oldest.timestamp.strftime('%Y%m%d')}_to_{newest.timestamp.strftime('%Y%m%d')}"
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')

        # Prepare data for archival
        log_data = []
        for log in logs:
            log_dict = {
                'id': log.id,
                'event_type': log.event_type,
                'timestamp': log.timestamp.isoformat(),
                'success': log.success,
                'message': log.message,
                'user_id': log.user.id if log.user else None,
                'username': log.username,
                'ip_address': log.ip_address,
                'user_agent': log.user_agent,
                'metadata': log.metadata,
            }
            log_data.append(log_dict)

        # Export to JSON
        if self.format in ['json', 'both']:
            json_filename = f'audit_logs_{date_range}_{timestamp}.json'
            json_content = json.dumps({
                'archive_date': timezone.now().isoformat(),
                'retention_days': self.days,
                'log_count': len(log_data),
                'date_range': {
                    'from': oldest.timestamp.isoformat(),
                    'to': newest.timestamp.isoformat(),
                },
                'logs': log_data,
            }, indent=2)

            if self.use_r2:
                # Upload to R2
                try:
                    self.r2_client.put_object(
                        Bucket=self.bucket_name,
                        Key=f'audit-archives/{json_filename}',
                        Body=json_content.encode('utf-8'),
                        ContentType='application/json'
                    )
                    self.stdout.write(f'JSON archive uploaded to R2: {json_filename}')
                except ClientError as e:
                    self.stdout.write(self.style.ERROR(f'Failed to upload JSON to R2: {e}'))
            else:
                # Save locally
                json_path = os.path.join(self.archive_dir, json_filename)
                with open(json_path, 'w') as f:
                    f.write(json_content)
                self.stdout.write(f'JSON archive created: {json_filename}')

        # Export to TXT (human-readable)
        if self.format in ['txt', 'both']:
            txt_filename = f'audit_logs_{date_range}_{timestamp}.txt'
            txt_content = []
            txt_content.append('=' * 100)
            txt_content.append('AUDIT LOG ARCHIVE')
            txt_content.append('=' * 100)
            txt_content.append(f'Archive Date: {timezone.now().strftime("%Y-%m-%d %H:%M:%S")}')
            txt_content.append(f'Retention Policy: {self.days} days')
            txt_content.append(f'Log Count: {len(log_data)}')
            txt_content.append(f'Date Range: {oldest.timestamp.strftime("%Y-%m-%d")} to {newest.timestamp.strftime("%Y-%m-%d")}')
            txt_content.append('=' * 100)
            txt_content.append('')

            for log_dict in log_data:
                txt_content.append('-' * 100)
                txt_content.append(f"ID: {log_dict['id']}")
                txt_content.append(f"Timestamp: {log_dict['timestamp']}")
                txt_content.append(f"Event Type: {log_dict['event_type']}")
                txt_content.append(f"Status: {'SUCCESS' if log_dict['success'] else 'FAILED'}")
                txt_content.append(f"User: {log_dict['username'] or log_dict['user_id'] or 'anonymous'}")
                txt_content.append(f"IP Address: {log_dict['ip_address'] or 'N/A'}")
                txt_content.append(f"Message: {log_dict['message']}")
                if log_dict['user_agent']:
                    txt_content.append(f"User Agent: {log_dict['user_agent']}")
                if log_dict['metadata']:
                    txt_content.append(f"Metadata: {json.dumps(log_dict['metadata'], indent=2)}")
                txt_content.append('-' * 100)
                txt_content.append('')

            txt_content_str = '\n'.join(txt_content)

            if self.use_r2:
                # Upload to R2
                try:
                    self.r2_client.put_object(
                        Bucket=self.bucket_name,
                        Key=f'audit-archives/{txt_filename}',
                        Body=txt_content_str.encode('utf-8'),
                        ContentType='text/plain'
                    )
                    self.stdout.write(f'TXT archive uploaded to R2: {txt_filename}')
                except ClientError as e:
                    self.stdout.write(self.style.ERROR(f'Failed to upload TXT to R2: {e}'))
            else:
                # Save locally
                txt_path = os.path.join(self.archive_dir, txt_filename)
                with open(txt_path, 'w') as f:
                    f.write(txt_content_str)
                self.stdout.write(f'TXT archive created: {txt_filename}')

        # Delete archived logs from database (bypass delete protection)
        # We need to use queryset.delete() instead of model.delete() to bypass protection
        deleted_count = logs._raw_delete(logs.db)

        return deleted_count
