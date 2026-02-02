# ----------------------------------------------------------------------------------------------------- #
# This review_summary_service.py file handles AI-generated review summaries for locations:             #
#                                                                                                      #
# Purpose:                                                                                             #
# Generates concise AI summaries of user reviews using Google Gemini 2.0 Flash. Summaries are         #
# generated lazily on first view with a stale flag + cooldown to prevent excessive API calls.         #
#                                                                                                      #
# Key Features:                                                                                        #
# - Lazy generation: Summaries generated on first view, not on every review change                    #
# - Stale flag: Marks summary as needing regeneration when reviews change                             #
# - Cooldown: Prevents regeneration within 60 minutes of last generation                              #
# - Minimum threshold: Requires 3+ reviews before generating a summary                                #
# - Graceful degradation: Returns None if API unavailable or error occurs                             #
#                                                                                                      #
# Architecture:                                                                                        #
# - Sync execution by default (CELERY_ENABLED=False)                                                  #
# - Async execution via Celery when CELERY_ENABLED=True                                               #
# - Signals mark summary stale on review create/update/delete                                         #
# - Serializer calls get_or_generate_summary() on location retrieval                                  #
# ----------------------------------------------------------------------------------------------------- #

import logging
from datetime import timedelta
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Configuration constants
MIN_REVIEWS_FOR_SUMMARY = 3  # Minimum reviews required to generate summary
COOLDOWN_MINUTES = 60        # Minutes between regenerations


class ReviewSummaryService:

    # ----------------------------------------------------------------------------- #
    # Checks if a location should have its summary regenerated.                     #
    #                                                                               #
    # Returns True if:                                                              #
    # - Location has 3+ reviews                                                     #
    # - Summary is marked as stale (or doesn't exist)                               #
    # - Cooldown period has passed (60 minutes since last generation)               #
    #                                                                               #
    # Args:   location: Location instance to check                                  #
    # Returns: bool: True if summary should be generated                            #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def should_generate_summary(location):
        # Check minimum review threshold
        review_count = location.reviews.count()
        if review_count < MIN_REVIEWS_FOR_SUMMARY:
            return False

        # Check if summary is stale (needs regeneration)
        if not location.review_summary_stale:
            return False

        # Check cooldown period
        if location.last_summary_generated:
            cooldown_end = location.last_summary_generated + timedelta(minutes=COOLDOWN_MINUTES)
            if timezone.now() < cooldown_end:
                return False

        return True

    # ----------------------------------------------------------------------------- #
    # Marks a location's review summary as stale (needing regeneration).            #
    #                                                                               #
    # Called by signals when reviews are created, updated, or deleted.              #
    # Does not trigger immediate regeneration - that happens on next view.          #
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
    # This method calls the Gemini API and saves the result to the location.        #
    # It handles errors gracefully and returns None if generation fails.            #
    #                                                                               #
    # Args:   location_id: ID of the Location to generate summary for               #
    # Returns: str or None: Generated summary text, or None on failure              #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def generate_summary(location_id):
        from starview_app.models import Location

        try:
            location = Location.objects.get(id=location_id)
        except Location.DoesNotExist:
            logger.error("Location %d not found for summary generation", location_id)
            return None

        # Check if we should generate (respects cooldown, threshold, stale flag)
        if not ReviewSummaryService.should_generate_summary(location):
            logger.info(
                "Skipping summary generation for location %d (not needed)",
                location_id
            )
            return location.review_summary

        # Check for API key
        api_key = getattr(settings, 'GEMINI_API_KEY', None)
        if not api_key:
            logger.warning("GEMINI_API_KEY not configured, skipping summary generation")
            return None

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
                    "Generated review summary for location %s (ID: %d): %s...",
                    location.name,
                    location.pk,
                    summary[:50]
                )

            return summary

        except Exception as e:
            logger.error(
                "Error generating review summary for location %d: %s",
                location_id,
                str(e),
                exc_info=True
            )
            return None

    # ----------------------------------------------------------------------------- #
    # Entry point for lazy summary generation on location view.                     #
    #                                                                               #
    # This method is called by the serializer when a location is retrieved.         #
    # It returns the existing summary if valid, or triggers generation if needed.   #
    #                                                                               #
    # Behavior depends on CELERY_ENABLED setting:                                   #
    # - False (default): Generates synchronously (blocks request)                   #
    # - True: Queues async task, returns stale summary immediately                  #
    #                                                                               #
    # Args:   location: Location instance                                           #
    # Returns: str or None: Summary text (existing, newly generated, or None)       #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_or_generate_summary(location):
        # Check minimum review threshold first
        review_count = location.reviews.count()
        if review_count < MIN_REVIEWS_FOR_SUMMARY:
            return None

        # If summary is not stale, return existing
        if not location.review_summary_stale and location.review_summary:
            return location.review_summary

        # Check cooldown - if within cooldown, return existing summary
        if location.last_summary_generated:
            cooldown_end = location.last_summary_generated + timedelta(minutes=COOLDOWN_MINUTES)
            if timezone.now() < cooldown_end:
                return location.review_summary

        # Check if Celery is enabled
        use_celery = getattr(settings, 'CELERY_ENABLED', False)

        if use_celery:
            # Async generation - queue task and return existing (stale) summary
            from starview_app.utils.tasks import generate_review_summary
            generate_review_summary.delay(location.pk)
            logger.info(
                "Queued async summary generation for location %d",
                location.pk
            )
            return location.review_summary
        else:
            # Sync generation - blocks until complete
            return ReviewSummaryService.generate_summary(location.pk)
