# ----------------------------------------------------------------------------------------------------- #
# Django Management Command - Audit Log Archival (Production Only)                                      #
#                                                                                                       #
# Purpose:                                                                                              #
# Archives old audit logs to R2 cloud storage and removes them from the database.                       #
# Maintains compliance while preventing database bloat in production.                                   #
#                                                                                                       #
# Note: This command is disabled in development (DEBUG=True) since audit logging is also disabled.     #
#                                                                                                       #
# Features:                                                                                             #
# - Archives logs older than specified days (default: 30) to Cloudflare R2                              #
# - Exports to both JSON (structured) and TXT (human-readable) formats                                  #
# - Bypasses delete protection for archival purposes                                                    #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py archive_audit_logs [options]                                                       #
#                                                                                                       #
# Options:                                                                                              #
#   --days N                  Archive logs older than N days (default: 30)                              #
#   --dry-run                 Show what would be archived without making changes                        #
#   --format json|txt|both    Archive format (default: both)                                            #
# ----------------------------------------------------------------------------------------------------- #

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
        # Skip archiving in development - audit logs are disabled locally anyway
        if settings.DEBUG:
            self.stdout.write(self.style.WARNING(
                'Archiving is disabled in development mode.\n'
                'Audit logs are not created locally (DEBUG=True), so there is nothing to archive.\n'
                'This command only runs in production where logs are archived to R2.'
            ))
            return

        self.dry_run = options['dry_run']
        self.days = options['days']
        self.format = options['format']

        # Initialize R2 client with dedicated audit credentials (principle of least privilege)
        # Falls back to main R2 credentials if audit-specific ones not configured
        audit_key_id = getattr(settings, 'AUDIT_R2_ACCESS_KEY_ID', None) or settings.AWS_ACCESS_KEY_ID
        audit_secret = getattr(settings, 'AUDIT_R2_SECRET_ACCESS_KEY', None) or settings.AWS_SECRET_ACCESS_KEY
        self.bucket_name = getattr(settings, 'AUDIT_R2_BUCKET_NAME', None) or settings.AWS_STORAGE_BUCKET_NAME

        using_dedicated_creds = bool(getattr(settings, 'AUDIT_R2_ACCESS_KEY_ID', None))
        creds_info = 'dedicated audit credentials' if using_dedicated_creds else 'shared media credentials (configure AUDIT_R2_* for separation)'
        self.stdout.write(self.style.WARNING(f'Archives will be stored in R2 bucket "{self.bucket_name}" using {creds_info}'))

        self.r2_client = boto3.client(
            's3',
            endpoint_url=f'https://{settings.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=audit_key_id,
            aws_secret_access_key=audit_secret,
            region_name='auto'
        )

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
            # Archive logs to R2
            archived_count = self.archive_logs(old_logs, cutoff_date)

            self.stdout.write(self.style.SUCCESS(f'\nArchived {archived_count} audit logs'))
            self.stdout.write(f'Archive location: R2 bucket "{self.bucket_name}" in audit-archives/ folder')
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

        # Delete archived logs from database (bypass delete protection)
        # We need to use queryset.delete() instead of model.delete() to bypass protection
        deleted_count = logs._raw_delete(logs.db)

        return deleted_count
