"""Remove abandoned registrations without deleting established accounts."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from allauth.account.models import EmailConfirmation
from django.conf import settings


class Command(BaseCommand):
    help = 'Delete abandoned registrations after a grace period and clean up expired confirmations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be deleted without actually deleting'
        )
        parser.add_argument('--days', type=int, default=7, help='Minimum registration age in days (at least 1; default 7)')

    def candidates(self, cutoff):
        # Exclude any verified address, any linked provider, and privileged accounts.
        # A pending secondary email must never make an established account eligible.
        return get_user_model().objects.filter(
            date_joined__lt=cutoff,
            is_staff=False,
            is_superuser=False,
            userprofile__is_system_account=False,
            emailaddress__verified=False,
        ).exclude(emailaddress__verified=True).exclude(socialaccount__isnull=False).distinct()

    # ----------------------------------------------------------------------------- #
    # Execute the cleanup process for unverified users and email confirmations.     #
    #                                                                               #
    # This method runs two cleanup operations:                                      #
    # 1. Delete only abandoned registrations older than the grace period           #
    # 2. Delete expired/orphaned email confirmation tokens                          #
    #                                                                               #
    # Args:   *args: Unused positional arguments                                    #
    #         **options: Command-line options (dry_run)                             #
    # Returns: None (outputs results to stdout)                                     #
    # ----------------------------------------------------------------------------- #
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        days = options['days']
        if days < 1:
            raise CommandError('--days must be at least 1.')
        cutoff = timezone.now() - timedelta(days=days)

        # ========================================
        # Part 1: Delete unverified users
        # ========================================

        self.stdout.write('\n' + '='*60)
        self.stdout.write('Cleaning up unverified users...')
        self.stdout.write('='*60)

        candidates = self.candidates(cutoff)
        candidate_ids = list(candidates.values_list('pk', flat=True))
        self.stdout.write(f'Found {len(candidate_ids)} abandoned registration(s) older than {days} days.')
        deleted_count = 0
        for user_id in candidate_ids:
            if dry_run:
                self.stdout.write(f'  Would delete user id={user_id}')
                continue
            # Recheck eligibility after locking, rather than deleting a stale preview.
            with transaction.atomic():
                user = get_user_model().objects.select_for_update().filter(pk=user_id).first()
                if user and self.candidates(cutoff).filter(pk=user.pk).exists():
                    user.delete()
                    deleted_count += 1
        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f'Deleted {deleted_count} abandoned registration(s).'))

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
