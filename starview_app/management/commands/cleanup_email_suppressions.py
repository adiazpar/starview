# ----------------------------------------------------------------------------------------------------- #
# Django Management Command - Email Suppression List Cleanup                                            #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides maintenance utilities for email bounce/complaint tracking and suppression list.              #
# Designed to be called by send_weekly_digest command or run standalone.                                #
#                                                                                                       #
# Features:                                                                                             #
# - Remove old soft bounce records after recovery period                                                #
# - Deactivate suppressions for soft bounces that have stabilized                                       #
# - Clean up stale bounce records (no activity for 90+ days)                                            #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py cleanup_email_suppressions [options]                                               #
#                                                                                                       #
# Options:                                                                                              #
#   --soft-bounce-days N    Days to keep soft bounce suppressions (default: 30)                         #
#   --stale-days N          Days to retain bounce and complaint event receipts (default: 90)             #
#   --dry-run               Show what would be cleaned without making changes                           #
#   --report                Generate email health report (stdout only)                                  #
#                                                                                                       #
# Note: For email reports, use send_weekly_digest with --run-cleanup flag instead.                      #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.db.models import Count
from django.db import transaction
from datetime import timedelta
from starview_app.models import EmailBounce, EmailComplaint, EmailSuppressionList
from starview_app.utils.email_utils import get_email_statistics


class Command(BaseCommand):
    help = 'Clean up email bounce records and manage suppression list'

    def add_arguments(self, parser):
        parser.add_argument(
            '--soft-bounce-days',
            type=int,
            default=30,
            help='Days to keep soft bounce suppressions (default: 30)',
        )
        parser.add_argument(
            '--stale-days',
            type=int,
            default=90,
            help='Days to retain bounce and complaint event receipts (default: 90)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be cleaned without making changes',
        )
        parser.add_argument(
            '--report',
            action='store_true',
            help='Generate email health report',
        )


    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.soft_bounce_days = options['soft_bounce_days']
        self.stale_days = options['stale_days']
        if self.stale_days < 31:
            raise CommandError('Event retention must exceed the 30-day SNS acceptance window.')

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        if options['report']:
            self.generate_report()
            return

        # Run cleanup tasks
        self.cleanup_soft_bounces()
        self.cleanup_stale_bounces()
        self.cleanup_old_complaints()

        self.stdout.write(self.style.SUCCESS('\nCleanup completed successfully'))


    def cleanup_soft_bounces(self):
        cutoff = timezone.now() - timedelta(days=self.soft_bounce_days)
        released = 0
        # Decisions use the latest event for the address, not an older event row.
        for pk in EmailSuppressionList.objects.filter(reason='soft_bounce', is_active=True).values_list('pk', flat=True):
            with transaction.atomic():
                suppression = EmailSuppressionList.objects.select_for_update().get(pk=pk)
                if suppression.reason != 'soft_bounce' or not suppression.is_active:
                    continue
                if EmailBounce.objects.filter(email=suppression.email, last_bounce_date__gte=cutoff).exists():
                    continue
                if not self.dry_run:
                    suppression.is_active = False
                    suppression.save(update_fields=['is_active'])
                    EmailBounce.objects.filter(email=suppression.email).update(suppressed=False)
                released += 1
        self.stdout.write(f'Soft bounce suppressions eligible for release: {released}')

    def cleanup_stale_bounces(self):
        cutoff = timezone.now() - timedelta(days=self.stale_days)
        records = EmailBounce.objects.filter(last_bounce_date__lt=cutoff)
        count = records.count()
        if not self.dry_run:
            records.delete()
        self.stdout.write(f'Bounce event receipts eligible for deletion: {count}')

    def cleanup_old_complaints(self):
        cutoff = timezone.now() - timedelta(days=self.stale_days)
        records = EmailComplaint.objects.filter(complaint_date__lt=cutoff)
        count = records.count()
        if not self.dry_run:
            records.delete()
        # Suppression records survive via SET_NULL; review is optional, never a
        # prerequisite for cleanup or for stopping promotional mail.
        self.stdout.write(f'Complaint event receipts eligible for deletion: {count}')


    # Generate email health report with statistics
    def generate_report(self):
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('EMAIL HEALTH REPORT')
        self.stdout.write('=' * 80)

        # Get statistics
        stats = get_email_statistics()

        self.stdout.write('\nBounce Statistics:')
        self.stdout.write(f'  Total Bounces: {stats["total_bounces"]}')
        self.stdout.write(f'  - Hard Bounces: {stats["hard_bounces"]} (permanent)')
        self.stdout.write(f'  - Soft Bounces: {stats["soft_bounces"]} (temporary)')

        self.stdout.write('\nComplaint Statistics:')
        self.stdout.write(f'  Total Complaints: {stats["total_complaints"]}')

        self.stdout.write('\nSuppression List:')
        self.stdout.write(f'  Active Suppressions: {stats["suppressed_emails"]}')

        # Breakdown by reason
        suppressions_by_reason = EmailSuppressionList.objects.filter(
            is_active=True
        ).values('reason').annotate(count=Count('id'))

        if suppressions_by_reason:
            self.stdout.write('\n  By Reason:')
            for item in suppressions_by_reason:
                self.stdout.write(f'    - {item["reason"]}: {item["count"]}')

        # Recent activity (last 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_bounces = EmailBounce.objects.filter(last_bounce_date__gte=seven_days_ago).count()
        recent_complaints = EmailComplaint.objects.filter(complaint_date__gte=seven_days_ago).count()

        self.stdout.write('\nRecent Activity (Last 7 Days):')
        self.stdout.write(f'  New Bounces: {recent_bounces}')
        self.stdout.write(f'  New Complaints: {recent_complaints}')

        # Health indicators
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('HEALTH INDICATORS')
        self.stdout.write('=' * 80)

        # Check for warning signs
        warnings = []

        if stats['hard_bounces'] > 100:
            warnings.append('WARNING: High number of hard bounces - review email collection process')

        if stats['total_complaints'] > 10:
            warnings.append('WARNING: Complaints detected - review email content and frequency')

        if recent_bounces > 50:
            warnings.append('WARNING: High recent bounce rate - check email service health')

        if stats['soft_bounces'] > 200:
            warnings.append('WARNING: High soft bounce count - some mailboxes may be full')

        if warnings:
            self.stdout.write('')
            for warning in warnings:
                self.stdout.write(self.style.WARNING(warning))
        else:
            self.stdout.write(self.style.SUCCESS('\nEmail deliverability is healthy'))

        self.stdout.write('\n' + '=' * 80)
