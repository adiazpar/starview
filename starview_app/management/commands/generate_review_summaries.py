# ----------------------------------------------------------------------------------------------------- #
# This generate_review_summaries.py management command handles AI summary generation in batches:       #
#                                                                                                      #
# Purpose:                                                                                             #
# Processes stale review summaries using Google Gemini 2.0 Flash API in controlled batches.            #
# This approach prevents rate limiting and ensures page views are never blocked by API calls.          #
#                                                                                                      #
# Architecture:                                                                                        #
# - Page views NEVER block on API calls - they always return existing summaries instantly              #
# - This command is run via cron job to regenerate stale summaries in the background                   #
# - Signals mark summaries as stale when reviews are created/updated/deleted                           #
#                                                                                                      #
# Deployment (Render):                                                                                 #
#   Name: generate-review-summaries                                                                    #
#   Command: python manage.py generate_review_summaries                                                #
#   Schedule: 0 */6 * * * (every 6 hours)                                                              #
#                                                                                                      #
# Usage:                                                                                               #
#   python manage.py generate_review_summaries                    # Process up to 50 stale summaries   #
#   python manage.py generate_review_summaries --batch-size=100   # Custom batch size                  #
#   python manage.py generate_review_summaries --dry-run          # Preview without generating         #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand
from django.db.models import Count
from starview_app.models import Location
from starview_app.services.review_summary_service import ReviewSummaryService, MIN_REVIEWS_FOR_SUMMARY
import time


class Command(BaseCommand):
    help = 'Generate AI review summaries for locations with stale summaries'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=50,
            help='Maximum number of summaries to generate per run (default: 50)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be generated without making API calls'
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=1.0,
            help='Delay in seconds between API calls to avoid rate limits (default: 1.0)'
        )

    # ----------------------------------------------------------------------------- #
    # Execute the batch summary generation process.                                  #
    #                                                                               #
    # Finds all locations with stale summaries that have enough reviews,            #
    # then processes them in batches with delays to respect API rate limits.        #
    #                                                                               #
    # Args:   *args: Unused positional arguments                                    #
    #         **options: Command-line options (batch_size, dry_run, delay)          #
    # Returns: None (outputs results to stdout)                                     #
    # ----------------------------------------------------------------------------- #
    def handle(self, *args, **options):
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        delay = options['delay']

        self.stdout.write('\n' + '='*60)
        self.stdout.write('AI Review Summary Generator')
        self.stdout.write('='*60)

        # Find locations with stale summaries and enough reviews
        stale_locations = Location.objects.filter(
            review_summary_stale=True
        ).annotate(
            review_count=Count('reviews')
        ).filter(
            review_count__gte=MIN_REVIEWS_FOR_SUMMARY
        ).order_by('last_summary_generated')[:batch_size]

        total_stale = stale_locations.count()

        if total_stale == 0:
            self.stdout.write(self.style.SUCCESS('\nNo stale summaries to process.'))
            return

        self.stdout.write(f'\nFound {total_stale} location(s) with stale summaries:')
        self.stdout.write(f'Batch size: {batch_size}, Delay: {delay}s between calls\n')

        # Preview locations
        for location in stale_locations:
            review_count = location.review_count
            has_existing = bool(location.review_summary)
            status = 'update' if has_existing else 'new'
            self.stdout.write(
                f'  - {location.name} (ID: {location.pk}) - '
                f'{review_count} reviews, {status}'
            )

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n[DRY RUN] Would generate {total_stale} summary/summaries'
            ))
            return

        # Process summaries
        self.stdout.write('\nGenerating summaries...\n')

        success_count = 0
        failure_count = 0

        for i, location in enumerate(stale_locations):
            # Add delay between calls (except for the first one)
            if i > 0:
                time.sleep(delay)

            self.stdout.write(f'Processing: {location.name} (ID: {location.pk})...')

            try:
                result = ReviewSummaryService.generate_summary(location)

                if result:
                    success_count += 1
                    # Truncate for display
                    preview = location.review_summary[:60] + '...' if len(location.review_summary) > 60 else location.review_summary
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Generated: "{preview}"'))
                else:
                    failure_count += 1
                    self.stdout.write(self.style.WARNING(f'  ⚠ Skipped or failed'))

            except Exception as e:
                failure_count += 1
                self.stdout.write(self.style.ERROR(f'  ✗ Error: {str(e)}'))

        # Summary
        self.stdout.write('\n' + '='*60)
        self.stdout.write('Summary')
        self.stdout.write('='*60)
        self.stdout.write(f'  Processed: {total_stale}')
        self.stdout.write(self.style.SUCCESS(f'  Success: {success_count}'))
        if failure_count > 0:
            self.stdout.write(self.style.WARNING(f'  Failed/Skipped: {failure_count}'))
        self.stdout.write('')
