"""
Django management command to audit and fix user badges.

This command checks all users' badges to ensure they still meet the criteria.
Useful for cleaning up orphaned badges after bulk deletions or system changes.

Usage:
    python manage.py audit_badges              # Preview mode (shows what would be fixed)
    python manage.py audit_badges --fix        # Actually revoke invalid badges
    python manage.py audit_badges --user stony # Audit specific user only

Features:
- Checks all badge categories (Exploration, Contribution, Quality, Review, Community, Special)
- Shows detailed report of invalid badges
- Safe preview mode by default (--fix required to make changes)
- Can audit specific user or all users
- Colorized output for easy reading
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from starview_app.models import (
    Badge, UserBadge, Location, Review, LocationVisit,
    Follow, ReviewComment
)
from starview_app.services.badge_service import BadgeService, SYSTEM_USERNAMES


class Command(BaseCommand):
    help = 'Audit user badges and revoke any that no longer meet criteria'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Actually revoke invalid badges (default is preview mode)',
        )
        parser.add_argument(
            '--user',
            type=str,
            help='Audit specific user only (username)',
        )

    def handle(self, *args, **options):
        fix_mode = options['fix']
        username = options.get('user')

        self.stdout.write("=" * 70)
        self.stdout.write(self.style.SUCCESS("BADGE AUDIT REPORT"))
        self.stdout.write("=" * 70)

        if fix_mode:
            self.stdout.write(self.style.WARNING("\n⚠️  FIX MODE: Invalid badges WILL be revoked\n"))
        else:
            self.stdout.write(self.style.NOTICE("\n📋 PREVIEW MODE: No changes will be made"))
            self.stdout.write(self.style.NOTICE("    Use --fix to actually revoke invalid badges\n"))

        # Get users to audit (excluding system users)
        if username:
            if username in SYSTEM_USERNAMES:
                self.stdout.write(self.style.WARNING(f"User '{username}' is a system user (excluded from badge audit)"))
                return
            try:
                users = [User.objects.get(username=username)]
                self.stdout.write(f"Auditing user: {username}\n")
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"User '{username}' not found"))
                return
        else:
            users = User.objects.exclude(username__in=SYSTEM_USERNAMES)
            self.stdout.write(f"Auditing all users ({users.count()} total, excluding system users)\n")

        # Track statistics
        stats = {
            'users_checked': 0,
            'users_with_issues': 0,
            'total_invalid_badges': 0,
            'by_category': {},
        }

        # Audit each user
        for user in users:
            stats['users_checked'] += 1
            invalid_badges = self.audit_user(user, fix_mode)

            if invalid_badges:
                stats['users_with_issues'] += 1
                stats['total_invalid_badges'] += len(invalid_badges)

                self.stdout.write(self.style.WARNING(f"\n👤 User: {user.username}"))
                self.stdout.write(f"   Invalid badges found: {len(invalid_badges)}")

                for badge_info in invalid_badges:
                    badge = badge_info['badge']
                    reason = badge_info['reason']

                    # Track by category
                    cat = badge.category
                    stats['by_category'][cat] = stats['by_category'].get(cat, 0) + 1

                    status = "✓ REVOKED" if fix_mode else "⚠ WOULD REVOKE"
                    color = self.style.SUCCESS if fix_mode else self.style.WARNING

                    self.stdout.write(
                        f"   {color(status)}: {badge.name} ({badge.category})"
                    )
                    self.stdout.write(f"      Reason: {reason}")

        # Print summary
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("AUDIT SUMMARY"))
        self.stdout.write("=" * 70)
        self.stdout.write(f"Users checked: {stats['users_checked']}")
        self.stdout.write(f"Users with invalid badges: {stats['users_with_issues']}")
        self.stdout.write(f"Total invalid badges: {stats['total_invalid_badges']}")

        if stats['by_category']:
            self.stdout.write("\nInvalid badges by category:")
            for category, count in sorted(stats['by_category'].items()):
                self.stdout.write(f"  - {category}: {count}")

        if stats['total_invalid_badges'] == 0:
            self.stdout.write(self.style.SUCCESS("\n✅ All badges are valid! No issues found."))
        elif not fix_mode:
            self.stdout.write(
                self.style.WARNING(
                    f"\n⚠️  Run with --fix to revoke {stats['total_invalid_badges']} invalid badge(s)"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n✅ Successfully revoked {stats['total_invalid_badges']} invalid badge(s)"
                )
            )

    def audit_user(self, user, fix_mode):
        """
        Audit a single user's badges and return list of invalid badges.

        Args:
            user: User object to audit
            fix_mode: If True, actually revoke invalid badges

        Returns:
            List of dicts with 'badge' and 'reason' keys
        """
        invalid_badges = []

        # Get all badges user currently has
        user_badges = UserBadge.objects.filter(user=user).select_related('badge')

        for user_badge in user_badges:
            badge = user_badge.badge
            should_revoke = False
            reason = ""

            # Check based on category
            if badge.category == 'EXPLORATION':
                # Check location visit count
                visit_count = LocationVisit.objects.filter(user=user).count()
                if visit_count < badge.criteria_value:
                    should_revoke = True
                    reason = f"Has {visit_count} visits, needs {badge.criteria_value}"

            elif badge.category == 'CONTRIBUTION':
                # Check location creation count
                location_count = Location.objects.filter(added_by=user).count()
                if location_count < badge.criteria_value:
                    should_revoke = True
                    reason = f"Has {location_count} locations, needs {badge.criteria_value}"

            elif badge.category == 'QUALITY':
                # Check well-rated locations (4+ stars)
                quality_count = Location.objects.filter(
                    added_by=user,
                    average_rating__gte=4.0
                ).count()
                if quality_count < badge.criteria_value:
                    should_revoke = True
                    reason = f"Has {quality_count} quality locations, needs {badge.criteria_value}"

            elif badge.category == 'REVIEW':
                # Check review-related criteria
                from django.contrib.contenttypes.models import ContentType
                from starview_app.models import Vote

                user_reviews = Review.objects.filter(user=user)
                review_count = user_reviews.count()

                if badge.criteria_type == 'REVIEWS_WRITTEN':
                    if review_count < badge.criteria_value:
                        should_revoke = True
                        reason = f"Has {review_count} reviews, needs {badge.criteria_value}"

                elif badge.criteria_type == 'UPVOTES_RECEIVED':
                    review_ct = ContentType.objects.get_for_model(Review)
                    user_review_ids = user_reviews.values_list('id', flat=True)
                    upvote_count = Vote.objects.filter(
                        content_type=review_ct,
                        object_id__in=user_review_ids,
                        is_upvote=True
                    ).count()

                    if upvote_count < badge.criteria_value:
                        should_revoke = True
                        reason = f"Has {upvote_count} upvotes, needs {badge.criteria_value}"

                elif badge.criteria_type == 'HELPFUL_RATIO':
                    review_ct = ContentType.objects.get_for_model(Review)
                    user_review_ids = user_reviews.values_list('id', flat=True)
                    votes_on_reviews = Vote.objects.filter(
                        content_type=review_ct,
                        object_id__in=user_review_ids
                    )

                    upvote_count = votes_on_reviews.filter(is_upvote=True).count()
                    total_votes = votes_on_reviews.count()
                    helpful_ratio = (upvote_count / total_votes * 100) if total_votes > 0 else 0

                    min_reviews = badge.criteria_value
                    min_ratio = badge.criteria_secondary

                    if review_count < min_reviews or helpful_ratio < min_ratio:
                        should_revoke = True
                        reason = f"Has {review_count} reviews (needs {min_reviews}) with {helpful_ratio:.1f}% helpful (needs {min_ratio}%)"

            elif badge.category == 'COMMUNITY':
                # Check community engagement
                if badge.criteria_type == 'FOLLOWER_COUNT':
                    follower_count = Follow.objects.filter(following=user).count()
                    if follower_count < badge.criteria_value:
                        should_revoke = True
                        reason = f"Has {follower_count} followers, needs {badge.criteria_value}"

                elif badge.criteria_type == 'COMMENTS_WRITTEN':
                    comment_count = ReviewComment.objects.filter(user=user).exclude(
                        review__user=user  # Exclude comments on own reviews
                    ).count()
                    if comment_count < badge.criteria_value:
                        should_revoke = True
                        reason = f"Has {comment_count} comments, needs {badge.criteria_value}"

            elif badge.category == 'SPECIAL':
                # Check Photographer badge
                if badge.slug == 'photographer':
                    from starview_app.models import ReviewPhoto
                    photo_count = ReviewPhoto.objects.filter(review__user=user).count()
                    if photo_count < 25:
                        should_revoke = True
                        reason = f"Has {photo_count} photos, needs 25"

            elif badge.category == 'TENURE':
                # Pioneer badge - never revoke (it's a historical achievement)
                # Users who were in first 100 keep it permanently
                pass

            # Record or revoke if invalid
            if should_revoke:
                invalid_badges.append({
                    'badge': badge,
                    'reason': reason
                })

                if fix_mode:
                    user_badge.delete()

        return invalid_badges
