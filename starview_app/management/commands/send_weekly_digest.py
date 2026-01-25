# ----------------------------------------------------------------------------------------------------- #
# Django Management Command - Weekly Digest Report                                                     #
#                                                                                                       #
# Purpose:                                                                                              #
# Sends a weekly email digest with app activity metrics, user engagement stats,                        #
# content growth, and system health indicators. Designed to run as a weekly Render cronjob.            #
#                                                                                                       #
# Features:                                                                                             #
# - User activity: new signups, active users, login security                                           #
# - Content metrics: locations, reviews, photos, visits                                                #
# - Engagement: badges earned, follows, votes                                                          #
# - Email health: bounces, complaints, suppressions                                                    #
# - System health: pending reports, unverified locations                                               #
#                                                                                                       #
# Usage:                                                                                                #
#   python manage.py send_weekly_digest [options]                                                       #
#                                                                                                       #
# Options:                                                                                              #
#   --email EMAIL           Email address to send digest to (required for sending)                     #
#   --dry-run               Preview digest data without sending email                                  #
#   --days N                Reporting period in days (default: 7)                                      #
#   --run-cleanup           Also run email suppression cleanup before generating digest                #
#                                                                                                       #
# Render Cronjob Configuration:                                                                         #
#   Build Command: ./builds/build-cron.sh                                                               #
#   Start Command: python manage.py send_weekly_digest --email admin@starview.app --run-cleanup        #
#   Schedule: 0 3 * * 1 (Every Monday at 3 AM)                                                          #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.utils import timezone
from django.db.models import Count, Q, Avg
from django.contrib.auth import get_user_model
from datetime import timedelta
from io import StringIO

from starview_app.models import (
    Location, Review, LocationVisit, LocationPhoto, FavoriteLocation,
    UserBadge, Badge, Follow, Vote, Report,
    AuditLog, EmailBounce, EmailComplaint, EmailSuppressionList
)
from starview_app.utils.email_utils import get_email_statistics

User = get_user_model()


class Command(BaseCommand):
    help = 'Send weekly digest email with app activity and system health metrics'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            help='Email address to send digest to',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview digest data without sending email',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=7,
            help='Reporting period in days (default: 7)',
        )
        parser.add_argument(
            '--run-cleanup',
            action='store_true',
            help='Run email suppression cleanup before generating digest',
        )

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.email_to = options.get('email')
        self.days = options['days']
        self.run_cleanup = options['run_cleanup']

        # Calculate date range
        self.end_date = timezone.now()
        self.start_date = self.end_date - timedelta(days=self.days)

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No email will be sent'))

        self.stdout.write(f'\nGenerating digest for {self.start_date.strftime("%B %d")} - {self.end_date.strftime("%B %d, %Y")}')
        self.stdout.write('=' * 80)

        # Run email cleanup if requested
        cleanup_results = None
        if self.run_cleanup and not self.dry_run:
            cleanup_results = self.run_email_cleanup()

        # Gather all metrics
        user_metrics = self.gather_user_metrics()
        content_metrics = self.gather_content_metrics()
        engagement_metrics = self.gather_engagement_metrics()
        email_metrics = self.gather_email_metrics()
        system_metrics = self.gather_system_metrics()

        # Display metrics to console
        self.display_metrics(user_metrics, content_metrics, engagement_metrics, email_metrics, system_metrics)

        # Send email if address provided and not dry run
        if self.email_to and not self.dry_run:
            self.send_digest_email(
                user_metrics, content_metrics, engagement_metrics,
                email_metrics, system_metrics, cleanup_results
            )
        elif not self.email_to:
            self.stdout.write(self.style.WARNING('\nNo email address provided. Use --email to send digest.'))

    def run_email_cleanup(self):
        """Run the email suppression cleanup command and capture results."""
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('RUNNING EMAIL CLEANUP')
        self.stdout.write('=' * 80)

        # Capture cleanup output
        out = StringIO()
        call_command('cleanup_email_suppressions', stdout=out)
        self.stdout.write(out.getvalue())

        return {'ran': True}

    def gather_user_metrics(self):
        """Gather user activity metrics for the period."""
        # New user signups
        new_users = User.objects.filter(date_joined__gte=self.start_date).count()
        total_users = User.objects.count()

        # Active users (made a review, visit, or follow)
        active_reviewers = Review.objects.filter(
            created_at__gte=self.start_date
        ).values('user').distinct().count()

        active_visitors = LocationVisit.objects.filter(
            visited_at__gte=self.start_date
        ).values('user').distinct().count()

        # Users who logged in (from audit log)
        active_logins = AuditLog.objects.filter(
            event_type='login_success',
            timestamp__gte=self.start_date
        ).values('user').distinct().count()

        # Failed login attempts (security indicator)
        failed_logins = AuditLog.objects.filter(
            event_type='login_failed',
            timestamp__gte=self.start_date
        ).count()

        # Locked accounts
        locked_accounts = AuditLog.objects.filter(
            event_type='login_locked',
            timestamp__gte=self.start_date
        ).count()

        # Top active users (by review count this period)
        top_reviewers = Review.objects.filter(
            created_at__gte=self.start_date
        ).values('user__username').annotate(
            count=Count('id')
        ).order_by('-count')[:5]

        return {
            'new_users': new_users,
            'total_users': total_users,
            'active_logins': active_logins,
            'active_reviewers': active_reviewers,
            'active_visitors': active_visitors,
            'failed_logins': failed_logins,
            'locked_accounts': locked_accounts,
            'top_reviewers': list(top_reviewers),
        }

    def gather_content_metrics(self):
        """Gather content creation metrics for the period."""
        # New locations
        new_locations = Location.objects.filter(created_at__gte=self.start_date).count()
        total_locations = Location.objects.count()

        # New reviews
        new_reviews = Review.objects.filter(created_at__gte=self.start_date).count()
        total_reviews = Review.objects.count()

        # Average review rating this period
        avg_rating = Review.objects.filter(
            created_at__gte=self.start_date
        ).aggregate(avg=Avg('rating'))['avg']

        # New photos
        new_photos = LocationPhoto.objects.filter(created_at__gte=self.start_date).count()
        total_photos = LocationPhoto.objects.count()

        # New visits (been there check-ins)
        new_visits = LocationVisit.objects.filter(visited_at__gte=self.start_date).count()
        total_visits = LocationVisit.objects.count()

        # New favorites
        new_favorites = FavoriteLocation.objects.filter(created_at__gte=self.start_date).count()

        # Top reviewed locations this period
        top_locations = Review.objects.filter(
            created_at__gte=self.start_date
        ).values('location__name').annotate(
            count=Count('id')
        ).order_by('-count')[:5]

        return {
            'new_locations': new_locations,
            'total_locations': total_locations,
            'new_reviews': new_reviews,
            'total_reviews': total_reviews,
            'avg_rating': round(avg_rating, 1) if avg_rating else None,
            'new_photos': new_photos,
            'total_photos': total_photos,
            'new_visits': new_visits,
            'total_visits': total_visits,
            'new_favorites': new_favorites,
            'top_locations': list(top_locations),
        }

    def gather_engagement_metrics(self):
        """Gather user engagement metrics for the period."""
        # New badges earned
        new_badges = UserBadge.objects.filter(earned_at__gte=self.start_date).count()

        # Badge breakdown by category
        badges_by_category = UserBadge.objects.filter(
            earned_at__gte=self.start_date
        ).values('badge__category').annotate(
            count=Count('id')
        ).order_by('-count')

        # New follows
        new_follows = Follow.objects.filter(created_at__gte=self.start_date).count()

        # New votes (upvotes + downvotes)
        new_votes = Vote.objects.filter(created_at__gte=self.start_date).count()
        new_upvotes = Vote.objects.filter(
            created_at__gte=self.start_date,
            is_upvote=True
        ).count()

        # Most earned badges this period
        top_badges = UserBadge.objects.filter(
            earned_at__gte=self.start_date
        ).values('badge__name').annotate(
            count=Count('id')
        ).order_by('-count')[:5]

        return {
            'new_badges': new_badges,
            'badges_by_category': list(badges_by_category),
            'new_follows': new_follows,
            'new_votes': new_votes,
            'new_upvotes': new_upvotes,
            'top_badges': list(top_badges),
        }

    def gather_email_metrics(self):
        """Gather email health metrics."""
        stats = get_email_statistics()

        # Recent activity
        recent_bounces = EmailBounce.objects.filter(
            last_bounce_date__gte=self.start_date
        ).count()
        recent_complaints = EmailComplaint.objects.filter(
            complaint_date__gte=self.start_date
        ).count()

        # Suppressions by reason
        suppressions_by_reason = EmailSuppressionList.objects.filter(
            is_active=True
        ).values('reason').annotate(count=Count('id'))

        return {
            **stats,
            'recent_bounces': recent_bounces,
            'recent_complaints': recent_complaints,
            'suppressions_by_reason': list(suppressions_by_reason),
        }

    def gather_system_metrics(self):
        """Gather system health metrics."""
        # Pending content reports
        pending_reports = Report.objects.filter(status='PENDING').count()
        resolved_reports = Report.objects.filter(
            status='RESOLVED',
            updated_at__gte=self.start_date
        ).count()

        # Unverified locations
        unverified_locations = Location.objects.filter(is_verified=False).count()
        verified_this_period = AuditLog.objects.filter(
            event_type='location_verified',
            timestamp__gte=self.start_date
        ).count()

        # Build health warnings
        warnings = []
        if pending_reports > 10:
            warnings.append(f'{pending_reports} content reports pending review')
        if unverified_locations > 50:
            warnings.append(f'{unverified_locations} locations awaiting verification')

        return {
            'pending_reports': pending_reports,
            'resolved_reports': resolved_reports,
            'unverified_locations': unverified_locations,
            'verified_this_period': verified_this_period,
            'warnings': warnings,
        }

    def display_metrics(self, user, content, engagement, email, system):
        """Display metrics to console output."""
        # User Activity
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('USER ACTIVITY')
        self.stdout.write('=' * 80)
        self.stdout.write(f'  New Signups:        {user["new_users"]}')
        self.stdout.write(f'  Total Users:        {user["total_users"]}')
        self.stdout.write(f'  Active Logins:      {user["active_logins"]}')
        self.stdout.write(f'  Active Reviewers:   {user["active_reviewers"]}')
        self.stdout.write(f'  Failed Logins:      {user["failed_logins"]}')
        self.stdout.write(f'  Locked Accounts:    {user["locked_accounts"]}')

        if user['top_reviewers']:
            self.stdout.write('\n  Top Reviewers:')
            for r in user['top_reviewers']:
                self.stdout.write(f'    - {r["user__username"]}: {r["count"]} reviews')

        # Content
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('CONTENT METRICS')
        self.stdout.write('=' * 80)
        self.stdout.write(f'  New Locations:      {content["new_locations"]} (total: {content["total_locations"]})')
        self.stdout.write(f'  New Reviews:        {content["new_reviews"]} (total: {content["total_reviews"]})')
        self.stdout.write(f'  Avg Rating:         {content["avg_rating"] or "N/A"}')
        self.stdout.write(f'  New Photos:         {content["new_photos"]} (total: {content["total_photos"]})')
        self.stdout.write(f'  New Visits:         {content["new_visits"]} (total: {content["total_visits"]})')
        self.stdout.write(f'  New Favorites:      {content["new_favorites"]}')

        # Engagement
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('ENGAGEMENT')
        self.stdout.write('=' * 80)
        self.stdout.write(f'  Badges Earned:      {engagement["new_badges"]}')
        self.stdout.write(f'  New Follows:        {engagement["new_follows"]}')
        self.stdout.write(f'  New Votes:          {engagement["new_votes"]} ({engagement["new_upvotes"]} upvotes)')

        if engagement['top_badges']:
            self.stdout.write('\n  Popular Badges:')
            for b in engagement['top_badges']:
                self.stdout.write(f'    - {b["badge__name"]}: {b["count"]} earned')

        # Email Health
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('EMAIL HEALTH')
        self.stdout.write('=' * 80)
        self.stdout.write(f'  Total Bounces:      {email["total_bounces"]}')
        self.stdout.write(f'    - Hard:           {email["hard_bounces"]}')
        self.stdout.write(f'    - Soft:           {email["soft_bounces"]}')
        self.stdout.write(f'  Total Complaints:   {email["total_complaints"]}')
        self.stdout.write(f'  Suppressions:       {email["suppressed_emails"]}')
        self.stdout.write(f'  Recent Bounces:     {email["recent_bounces"]} (last {self.days} days)')
        self.stdout.write(f'  Recent Complaints:  {email["recent_complaints"]} (last {self.days} days)')

        # System Health
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('SYSTEM HEALTH')
        self.stdout.write('=' * 80)
        self.stdout.write(f'  Pending Reports:    {system["pending_reports"]}')
        self.stdout.write(f'  Resolved Reports:   {system["resolved_reports"]}')
        self.stdout.write(f'  Unverified Locs:    {system["unverified_locations"]}')
        self.stdout.write(f'  Verified This Week: {system["verified_this_period"]}')

        if system['warnings']:
            self.stdout.write('')
            for warning in system['warnings']:
                self.stdout.write(self.style.WARNING(f'  ⚠ {warning}'))

        self.stdout.write('\n' + '=' * 80)

    def send_digest_email(self, user, content, engagement, email_health, system, cleanup_results):
        """Send the digest email."""
        from django.conf import settings
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string

        # Build template context
        context = {
            'site_name': 'Starview',
            'report_date': self.end_date.strftime('%B %d, %Y'),
            'period_start': self.start_date.strftime('%B %d'),
            'period_end': self.end_date.strftime('%B %d, %Y'),
            'days': self.days,
            # User metrics
            'new_users': user['new_users'],
            'total_users': user['total_users'],
            'active_logins': user['active_logins'],
            'active_reviewers': user['active_reviewers'],
            'active_visitors': user['active_visitors'],
            'failed_logins': user['failed_logins'],
            'locked_accounts': user['locked_accounts'],
            'top_reviewers': user['top_reviewers'][:3],
            # Content metrics
            'new_locations': content['new_locations'],
            'total_locations': content['total_locations'],
            'new_reviews': content['new_reviews'],
            'total_reviews': content['total_reviews'],
            'avg_rating': content['avg_rating'],
            'new_photos': content['new_photos'],
            'new_visits': content['new_visits'],
            'new_favorites': content['new_favorites'],
            'top_locations': content['top_locations'][:3],
            # Engagement metrics
            'new_badges': engagement['new_badges'],
            'new_follows': engagement['new_follows'],
            'new_votes': engagement['new_votes'],
            'new_upvotes': engagement['new_upvotes'],
            'top_badges': engagement['top_badges'][:3],
            # Email health
            'total_bounces': email_health['total_bounces'],
            'hard_bounces': email_health['hard_bounces'],
            'soft_bounces': email_health['soft_bounces'],
            'total_complaints': email_health['total_complaints'],
            'suppressed_emails': email_health['suppressed_emails'],
            'recent_bounces': email_health['recent_bounces'],
            'recent_complaints': email_health['recent_complaints'],
            # System health
            'pending_reports': system['pending_reports'],
            'resolved_reports': system['resolved_reports'],
            'unverified_locations': system['unverified_locations'],
            'verified_this_period': system['verified_this_period'],
            'system_warnings': system['warnings'],
            # Cleanup results
            'cleanup_ran': cleanup_results is not None,
            # URLs
            'admin_url': 'https://www.starview.app/admin/',
            'analytics_url': 'https://analytics.google.com/',
        }

        # Build email health warnings
        email_warnings = []
        if email_health['hard_bounces'] > 100:
            email_warnings.append('High hard bounce count - review email collection')
        if email_health['total_complaints'] > 10:
            email_warnings.append('Complaints detected - review email frequency')
        if email_health['recent_bounces'] > 50:
            email_warnings.append('High recent bounce rate - check email service')
        context['email_warnings'] = email_warnings

        # Combine all warnings
        all_warnings = email_warnings + system['warnings']
        context['has_warnings'] = len(all_warnings) > 0
        context['all_warnings'] = all_warnings

        # Render templates
        subject = render_to_string('account/email/weekly_digest_subject.txt', context).strip()
        text_message = render_to_string('account/email/weekly_digest_message.txt', context)
        html_message = render_to_string('account/email/weekly_digest_message.html', context)

        # Send email
        try:
            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[self.email_to]
            )
            email_msg.attach_alternative(html_message, "text/html")
            email_msg.send(fail_silently=False)

            self.stdout.write(self.style.SUCCESS(f'\nWeekly digest sent to {self.email_to}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\nFailed to send digest: {str(e)}'))
