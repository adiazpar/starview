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
#   --stale-days N          Days of inactivity before marking bounce as stale (default: 90)             #
#   --dry-run               Show what would be cleaned without making changes                           #
#   --report                Generate email health report (stdout only)                                  #
#                                                                                                       #
# Note: For email reports, use send_weekly_digest with --run-cleanup flag instead.                      #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Count
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
            help='Days of inactivity before marking bounce as stale (default: 90)',
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

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        if options['report']:
            self.generate_report()
            return

        # Run cleanup tasks
        self.cleanup_soft_bounces()
        self.cleanup_stale_bounces()
        self.cleanup_transient_bounces()

        self.stdout.write(self.style.SUCCESS('\nCleanup completed successfully'))


    # Deactivate soft bounce suppressions after recovery period.
    # Soft bounces are temporary (mailbox full, server down, etc.).
    # After N days without new bounces, give the address another chance.
    def cleanup_soft_bounces(self):
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('SOFT BOUNCE CLEANUP')
        self.stdout.write('=' * 80)

        cutoff_date = timezone.now() - timedelta(days=self.soft_bounce_days)

        # Find soft bounces that haven't bounced recently
        old_soft_bounces = EmailBounce.objects.filter(
            bounce_type='soft',
            suppressed=True,
            last_bounce_date__lt=cutoff_date
        )

        count = old_soft_bounces.count()
        self.stdout.write(f'\nFound {count} soft bounce suppressions older than {self.soft_bounce_days} days')

        if count > 0:
            for bounce in old_soft_bounces:
                self.stdout.write(f'  - {bounce.email}: Last bounce {bounce.last_bounce_date.strftime("%Y-%m-%d")} ({bounce.bounce_count}x)')

                if not self.dry_run:
                    # Deactivate suppression
                    EmailSuppressionList.objects.filter(
                        email=bounce.email,
                        reason='soft_bounce',
                        is_active=True
                    ).update(is_active=False)

                    # Reset bounce record
                    bounce.suppressed = False
                    bounce.bounce_count = 0
                    bounce.save()

            if not self.dry_run:
                self.stdout.write(self.style.SUCCESS(f'\nDeactivated {count} soft bounce suppressions'))
            else:
                self.stdout.write(self.style.WARNING(f'\n[DRY RUN] Would deactivate {count} soft bounce suppressions'))


    # Remove bounce records with no recent activity.
    # After 90+ days of no bounces, consider the record stale and clean it up.
    # Keep hard bounces and complaints indefinitely.
    def cleanup_stale_bounces(self):
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('STALE BOUNCE CLEANUP')
        self.stdout.write('=' * 80)

        cutoff_date = timezone.now() - timedelta(days=self.stale_days)

        # Find soft/transient bounces with no recent activity
        stale_bounces = EmailBounce.objects.filter(
            bounce_type__in=['soft', 'transient'],
            suppressed=False,
            last_bounce_date__lt=cutoff_date
        )

        count = stale_bounces.count()
        self.stdout.write(f'\nFound {count} stale bounce records (inactive for {self.stale_days}+ days)')

        if count > 0:
            for bounce in stale_bounces[:10]:  # Show first 10
                self.stdout.write(f'  - {bounce.email}: Last bounce {bounce.last_bounce_date.strftime("%Y-%m-%d")}')

            if count > 10:
                self.stdout.write(f'  ... and {count - 10} more')

            if not self.dry_run:
                stale_bounces.delete()
                self.stdout.write(self.style.SUCCESS(f'\nDeleted {count} stale bounce records'))
            else:
                self.stdout.write(self.style.WARNING(f'\n[DRY RUN] Would delete {count} stale bounce records'))


    # Remove transient bounce records older than 7 days.
    # Transient bounces are temporary connection issues, not worth keeping.
    def cleanup_transient_bounces(self):
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('TRANSIENT BOUNCE CLEANUP')
        self.stdout.write('=' * 80)

        cutoff_date = timezone.now() - timedelta(days=7)

        transient_bounces = EmailBounce.objects.filter(
            bounce_type='transient',
            last_bounce_date__lt=cutoff_date
        )

        count = transient_bounces.count()
        self.stdout.write(f'\nFound {count} transient bounce records older than 7 days')

        if count > 0:
            if not self.dry_run:
                transient_bounces.delete()
                self.stdout.write(self.style.SUCCESS(f'Deleted {count} transient bounce records'))
            else:
                self.stdout.write(self.style.WARNING(f'[DRY RUN] Would delete {count} transient bounce records'))


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
