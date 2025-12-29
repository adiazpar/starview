"""
Django management command to award Pioneer badges to the first 100 verified users.

This command is designed to be run once after deploying the badge system to production.
It retroactively awards Pioneer badges to existing users who qualify (first 100 by registration date).

Usage:
    python manage.py award_pioneer_badges [--dry-run] [--force]

Options:
    --dry-run   Show who would receive badges without actually awarding them
    --force     Re-check all users, even if they already have the Pioneer badge

Why this command exists:
    The Pioneer badge is normally awarded via the email_confirmed signal when users verify their email.
    However, if you deploy the badge system after users have already registered and verified,
    those users won't get the Pioneer badge automatically. This command fixes that.

Safety:
    - Uses BadgeService.award_badge() which prevents duplicate awards (get_or_create)
    - Only awards to first 100 users by date_joined (historical snapshot)
    - Dry-run mode available to preview changes before applying
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from starview_app.models import Badge, UserBadge
from starview_app.services.badge_service import BadgeService, SYSTEM_USERNAMES


class Command(BaseCommand):
    help = 'Awards Pioneer badges to the first 100 verified users (retroactive)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show who would receive badges without actually awarding them',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-check all users, even if they already have the Pioneer badge',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']

        self.stdout.write("="*70)
        self.stdout.write(self.style.SUCCESS("PIONEER BADGE AWARD PROCESS"))
        self.stdout.write("="*70)

        # Check if Pioneer badge exists
        pioneer_badge = Badge.objects.filter(slug='pioneer').first()
        if not pioneer_badge:
            self.stdout.write(self.style.ERROR(
                "\n✗ Pioneer badge not found in database!"
            ))
            self.stdout.write("  Run badge seeding command first to create badges.\n")
            return

        self.stdout.write(f"\n✓ Found Pioneer badge: {pioneer_badge.name}")
        self.stdout.write(f"  Description: {pioneer_badge.description}")
        self.stdout.write(f"  Category: {pioneer_badge.category}")
        self.stdout.write(f"  Tier: {pioneer_badge.tier}")

        # Get first 100 users by registration date (excluding system users)
        # Uses date_joined to ensure consistent historical snapshot
        first_100_users = User.objects.exclude(
            username__in=SYSTEM_USERNAMES
        ).order_by('date_joined')[:100]
        total_users = User.objects.exclude(username__in=SYSTEM_USERNAMES).count()

        self.stdout.write(f"\n📊 User Statistics:")
        self.stdout.write(f"  Total users in database: {total_users}")
        self.stdout.write(f"  Users in first 100 (by date_joined): {first_100_users.count()}")

        if first_100_users.count() == 0:
            self.stdout.write(self.style.WARNING("\n⚠️  No users found in database.\n"))
            return

        # Check how many already have the badge
        existing_badge_holders = UserBadge.objects.filter(
            badge=pioneer_badge,
            user__in=first_100_users
        ).count()

        self.stdout.write(f"  Already have Pioneer badge: {existing_badge_holders}")
        self.stdout.write(f"  Eligible for Pioneer badge: {first_100_users.count() - existing_badge_holders}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n🔍 DRY RUN MODE - No changes will be made\n"))
        else:
            self.stdout.write(self.style.NOTICE(f"\n🎖️  Awarding Pioneer badges...\n"))

        # Award badges
        awarded_count = 0
        already_had_count = 0
        skipped_count = 0

        for idx, user in enumerate(first_100_users, start=1):
            # Check if user already has badge (unless --force)
            has_badge = UserBadge.objects.filter(user=user, badge=pioneer_badge).exists()

            if has_badge and not force:
                already_had_count += 1
                continue

            if dry_run:
                # Show who would receive badge
                status = "already has" if has_badge else "would receive"
                self.stdout.write(
                    f"  #{idx:3d} - {user.username:20s} "
                    f"(joined: {user.date_joined.strftime('%Y-%m-%d')}) - {status}"
                )
                if not has_badge:
                    awarded_count += 1
            else:
                # Actually award badge
                created = BadgeService.award_badge(user, pioneer_badge)

                if created:
                    awarded_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ #{idx:3d} - {user.username:20s} "
                            f"(joined: {user.date_joined.strftime('%Y-%m-%d')}) - AWARDED"
                        )
                    )
                else:
                    already_had_count += 1
                    if force:
                        # Only show "already had" messages in force mode
                        self.stdout.write(
                            f"  • #{idx:3d} - {user.username:20s} "
                            f"(joined: {user.date_joined.strftime('%Y-%m-%d')}) - already had"
                        )

        # Print summary
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.SUCCESS("SUMMARY"))
        self.stdout.write("="*70)

        if dry_run:
            self.stdout.write(f"\n✓ DRY RUN COMPLETED")
            self.stdout.write(f"  Users who would receive badges: {awarded_count}")
            self.stdout.write(f"  Users who already have badges: {already_had_count}")
            self.stdout.write(f"\nTo actually award badges, run without --dry-run:\n")
            self.stdout.write(self.style.NOTICE("  python manage.py award_pioneer_badges\n"))
        else:
            self.stdout.write(f"\n✓ BADGE AWARD COMPLETED")
            self.stdout.write(f"  Badges awarded: {awarded_count}")
            self.stdout.write(f"  Already had badges: {already_had_count}")

            if awarded_count > 0:
                self.stdout.write(self.style.SUCCESS(
                    f"\n🎉 Successfully awarded Pioneer badges to {awarded_count} user(s)!\n"
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f"\n⚠️  No new badges awarded (all eligible users already have Pioneer badge)\n"
                ))
