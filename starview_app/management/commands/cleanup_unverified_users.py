# ----------------------------------------------------------------------------------------------------- #
# This cleanup_unverified_users.py management command prevents email squatting and database bloat:      #
#                                                                                                       #
# Purpose:                                                                                              #
# Django-allauth creates user accounts immediately upon registration, before email verification. This   #
# command cleans up abandoned accounts that never verified their email, preventing malicious users      #
# from "squatting" on email addresses and keeping the database lean.                                    #
#                                                                                                       #
# What It Cleans:                                                                                       #
# 1. Unverified user accounts older than X days (prevents email squatting)                              #
# 2. Expired email confirmation tokens (removes stale verification links)                               #
# 3. Orphaned confirmations where the user was deleted but the token remains                            #
#                                                                                                       #
# Deployment:                                                                                           #
# Should be run periodically via Render cron job (daily or weekly recommended).                         #
# Use --report flag to email summaries to admins for monitoring.                                        #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py cleanup_unverified_users --days=7 --dry-run                                        #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from allauth.account.models import EmailAddress, EmailConfirmation
from django.conf import settings


class Command(BaseCommand):
    help = 'Delete unverified users and clean up expired/orphaned email confirmations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=7,
            help='Delete unverified users older than this many days (default: 7)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be deleted without actually deleting'
        )

    # ----------------------------------------------------------------------------- #
    # Execute the cleanup process for unverified users and email confirmations.     #
    #                                                                               #
    # This method runs two cleanup operations:                                      #
    # 1. Delete users with unverified emails older than --days threshold            #
    # 2. Delete expired/orphaned email confirmation tokens                          #
    #                                                                               #
    # Args:   *args: Unused positional arguments                                    #
    #         **options: Command-line options (days, dry_run)                       #
    # Returns: None (outputs results to stdout)                                     #
    # ----------------------------------------------------------------------------- #
    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        cutoff_date = timezone.now() - timedelta(days=days)

        # ========================================
        # Part 1: Delete unverified users
        # ========================================

        self.stdout.write('\n' + '='*60)
        self.stdout.write('Cleaning up unverified users...')
        self.stdout.write('='*60)

        # Find all unverified email addresses for users registered before cutoff date
        # Exclude system accounts (like the seeder user) which don't need email verification
        unverified_emails = EmailAddress.objects.filter(
            verified=False,
            user__date_joined__lt=cutoff_date,
            user__profile__is_system_account=False
        ).select_related('user')

        user_count = unverified_emails.count()

        if user_count > 0:
            # Display what will be deleted
            self.stdout.write(f'\nFound {user_count} unverified user(s) older than {days} days:')
            self.stdout.write(f'Cutoff date: {cutoff_date.strftime("%Y-%m-%d %H:%M:%S")}\n')

            for email_address in unverified_emails:
                user = email_address.user
                days_old = (timezone.now() - user.date_joined).days
                self.stdout.write(
                    f'  - {user.username} ({user.email}) - registered {days_old} days ago'
                )

            if not dry_run:
                # Delete unverified users
                self.stdout.write('\nDeleting unverified users...')
                deleted_count = 0

                for email_address in unverified_emails:
                    user = email_address.user
                    username = user.username
                    email = user.email

                    try:
                        user.delete()  # This cascades and deletes EmailAddress too
                        deleted_count += 1
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Deleted: {username} ({email})'))
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f'  ✗ Failed to delete {username}: {e}'))

                self.stdout.write(self.style.SUCCESS(f'\n✓ Successfully deleted {deleted_count} unverified user(s)'))
        else:
            self.stdout.write(self.style.SUCCESS('No unverified users found to delete.'))

        # ========================================
        # Part 2: Clean up expired/orphaned email confirmations
        # ========================================

        self.stdout.write('\n' + '='*60)
        self.stdout.write('Cleaning up email confirmations...')
        self.stdout.write('='*60)

        # Get expiry days from settings (default: 3 days)
        expiry_days = getattr(settings, 'ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS', 3)
        confirmation_cutoff = timezone.now() - timedelta(days=expiry_days)

        # Find expired confirmations
        expired_confirmations = EmailConfirmation.objects.filter(
            sent__lt=confirmation_cutoff
        )

        # Find orphaned confirmations (email address no longer exists)
        orphaned_confirmations = EmailConfirmation.objects.filter(
            email_address__isnull=True
        )

        # Combine both querysets
        total_confirmations = expired_confirmations | orphaned_confirmations
        confirmation_count = total_confirmations.distinct().count()

        if confirmation_count > 0:
            self.stdout.write(f'\nFound {confirmation_count} confirmation(s) to clean up:')

            expired_count = expired_confirmations.count()
            orphaned_count = orphaned_confirmations.count()

            if expired_count > 0:
                self.stdout.write(f'  - {expired_count} expired confirmation(s) (>{expiry_days} days old)')
            if orphaned_count > 0:
                self.stdout.write(f'  - {orphaned_count} orphaned confirmation(s) (email address deleted)')

            if dry_run:
                self.stdout.write(self.style.WARNING(f'\n[DRY RUN] Would have deleted {confirmation_count} confirmation(s)'))
            else:
                # Delete confirmations
                deleted_count, _ = total_confirmations.delete()
                self.stdout.write(self.style.SUCCESS(f'\n✓ Successfully deleted {deleted_count} email confirmation(s)'))
        else:
            self.stdout.write(self.style.SUCCESS('No expired or orphaned confirmations found.'))

        # ========================================
        # Summary
        # ========================================

        if dry_run:
            self.stdout.write('\n' + '='*60)
            self.stdout.write(self.style.WARNING('[DRY RUN] No changes made to database'))
            self.stdout.write('='*60)
