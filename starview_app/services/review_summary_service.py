# ----------------------------------------------------------------------------------------------------- #
# This review_summary_service.py file handles AI-generated review summaries for locations:             #
#                                                                                                      #
# Purpose:                                                                                             #
# Generates concise AI summaries of user reviews using Google Gemini 2.0 Flash.                        #
#                                                                                                      #
# Architecture:                                                                                        #
# - Page views NEVER block on API calls - always return existing summary instantly                     #
# - Summaries are generated via scheduled cron job (batch processing)                                  #
# - Signals mark summaries as stale when reviews change                                                #
# - Cron job processes stale summaries in controlled batches                                           #
#                                                                                                      #
# Key Features:                                                                                        #
# - Instant page loads: No API blocking on user requests                                               #
# - Rate limit safe: Controlled batch size respects Gemini quotas                                      #
# - Graceful degradation: Users see stale summary until next batch run                                 #
# - Minimum threshold: Requires 3+ reviews before generating a summary                                 #
#                                                                                                      #
# Cron Configuration (Render):                                                                         #
# - Command: python manage.py generate_review_summaries                                                #
# - Schedule: Daily at 4am UTC (0 4 * * *)                                                              #
# - Batch size: 50 summaries per run (configurable via --batch-size)                                   #
# ----------------------------------------------------------------------------------------------------- #

import logging
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Configuration constants
MIN_REVIEWS_FOR_SUMMARY = 3  # Minimum reviews required to generate summary


class ReviewSummaryService:

    # ----------------------------------------------------------------------------- #
    # Marks a location's review summary as stale (needing regeneration).            #
    #                                                                               #
    # Called by signals when reviews are created, updated, or deleted.              #
    # The stale flag is processed by the cron job, not on page view.                #
    #                                                                               #
    # Args:   location: Location instance to mark stale                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def mark_stale(location):
        if not location.review_summary_stale:
            location.review_summary_stale = True
            location.save(update_fields=['review_summary_stale'])
            logger.info(
                "Marked review summary stale for location %s (ID: %d)",
                location.name,
                location.pk
            )

    # ----------------------------------------------------------------------------- #
    # Returns existing summary for a location (no generation on page view).         #
    #                                                                               #
    # This method is called by the serializer when a location is retrieved.         #
    # It NEVER blocks on API calls - always returns instantly.                      #
    #                                                                               #
    # Args:   location: Location instance                                           #
    # Returns: str or None: Existing summary text, or None if not yet generated     #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_or_generate_summary(location):
        # Check minimum review threshold
        review_count = location.reviews.count()
        if review_count < MIN_REVIEWS_FOR_SUMMARY:
            return None

        # Always return existing summary (even if stale)
        # Cron job will regenerate stale summaries in background
        return location.review_summary

    # ----------------------------------------------------------------------------- #
    # Builds the prompt for Gemini to generate a review summary.                    #
    #                                                                               #
    # Args:   location: Location instance with reviews                              #
    # Returns: str: Formatted prompt for Gemini API                                 #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def _build_prompt(location):
        reviews = location.reviews.select_related('user').order_by('-created_at')[:100]
        review_count = reviews.count()
        avg_rating = sum(r.rating for r in reviews) / review_count if review_count > 0 else 0

        # Build review text block
        review_lines = []
        for review in reviews:
            rating_stars = int(review.rating)
            text = review.comment.strip() if review.comment else ""
            if text:
                review_lines.append(f"[{rating_stars}/5 stars]: {text}")

        reviews_text = "\n".join(review_lines) if review_lines else "No review text available."

        # Get location type display name
        location_type = location.get_location_type_display()

        prompt = f'''You are summarizing user reviews for "{location.name}".
Location type: {location_type}, Rating: {avg_rating:.1f}/5 ({review_count} reviews)

Reviews:
{reviews_text}

Write 2-3 sentences highlighting what visitors praise and critique, focusing on stargazing-relevant aspects (darkness, views, accessibility, facilities). Be specific and mention actual details from reviews. Do not use flowery language or excessive enthusiasm.'''

        return prompt

    # ----------------------------------------------------------------------------- #
    # Generates a new review summary using Gemini API.                              #
    #                                                                               #
    # Called by the cron job management command, NOT on page view.                  #
    # Handles errors gracefully and updates location state.                         #
    #                                                                               #
    # Args:   location: Location instance to generate summary for                   #
    # Returns: bool: True if generation succeeded, False otherwise                  #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def generate_summary(location):
        # Check minimum review threshold
        review_count = location.reviews.count()
        if review_count < MIN_REVIEWS_FOR_SUMMARY:
            logger.info(
                "Skipping location %d - only %d reviews (need %d)",
                location.pk,
                review_count,
                MIN_REVIEWS_FOR_SUMMARY
            )
            return False

        # Check for API key
        api_key = getattr(settings, 'GEMINI_API_KEY', None)
        if not api_key:
            logger.error("GEMINI_API_KEY not configured")
            return False

        try:
            import google.generativeai as genai

            # Configure Gemini
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.0-flash')

            # Build prompt and generate summary
            prompt = ReviewSummaryService._build_prompt(location)
            response = model.generate_content(prompt)

            # Extract text from response
            summary = response.text.strip() if response.text else None

            if summary:
                # Save summary to location
                location.review_summary = summary
                location.review_summary_stale = False
                location.last_summary_generated = timezone.now()
                location.save(update_fields=[
                    'review_summary',
                    'review_summary_stale',
                    'last_summary_generated'
                ])

                logger.info(
                    "Generated summary for %s (ID: %d): %s...",
                    location.name,
                    location.pk,
                    summary[:50]
                )
                return True

            logger.warning(
                "Empty response from Gemini for location %d",
                location.pk
            )
            return False

        except Exception as e:
            logger.error(
                "Error generating summary for location %d: %s",
                location.pk,
                str(e)
            )
            return False
