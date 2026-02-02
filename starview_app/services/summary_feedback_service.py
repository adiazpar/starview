# ----------------------------------------------------------------------------------------------------- #
# This summary_feedback_service.py file handles feedback on AI-generated review summaries:            #
#                                                                                                     #
# Purpose:                                                                                            #
# Service layer for creating and managing user feedback on AI summaries. Provides methods for         #
# submitting feedback, retrieving user's feedback, and getting aggregate statistics.                  #
#                                                                                                     #
# Key Features:                                                                                       #
# - Create or update feedback (users can change their vote)                                           #
# - Get user's current feedback for a location                                                        #
# - Get aggregate stats for analytics                                                                 #
# - Auto-trigger summary regeneration when negative feedback exceeds threshold                        #
# ----------------------------------------------------------------------------------------------------- #

import hashlib
import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

# Feedback-triggered regeneration thresholds
MIN_FEEDBACK_FOR_REGENERATION = 5       # Minimum total votes before evaluating ratio
NEGATIVE_RATIO_THRESHOLD = 0.70         # 70% negative required to trigger
FEEDBACK_REGENERATION_COOLDOWN_DAYS = 7  # Days between feedback-triggered regenerations


class SummaryFeedbackService:

    # ----------------------------------------------------------------------------- #
    # Submit feedback on a location's AI summary.                                   #
    #                                                                               #
    # Creates new feedback if user hasn't voted yet, or updates existing feedback   #
    # if they change their vote. Stores a hash of the current summary text to       #
    # correlate feedback with specific summary versions.                            #
    #                                                                               #
    # Args:                                                                         #
    #   user: User instance who is submitting feedback                              #
    #   location: Location instance whose summary is being rated                    #
    #   is_helpful: bool - True for helpful, False for not helpful                  #
    #                                                                               #
    # Returns:                                                                      #
    #   dict: { 'is_helpful': bool, 'created': bool, 'updated': bool }              #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def submit_feedback(user, location, is_helpful):
        from starview_app.models import SummaryFeedback

        # Compute hash of current summary for version tracking
        summary_hash = ''
        if location.review_summary:
            summary_hash = hashlib.md5(location.review_summary.encode()).hexdigest()

        # Create or update feedback
        feedback, created = SummaryFeedback.objects.update_or_create(
            user=user,
            location=location,
            defaults={
                'is_helpful': is_helpful,
                'summary_hash': summary_hash,
            }
        )

        # Log for analytics
        action = "created" if created else "updated"
        feedback_type = "helpful" if is_helpful else "not helpful"
        logger.info(
            "Summary feedback %s: user=%s, location=%d, is_helpful=%s",
            action,
            user.username,
            location.pk,
            feedback_type
        )

        # Check if regeneration should be triggered (only on negative feedback)
        if not is_helpful:
            SummaryFeedbackService.check_and_trigger_regeneration(location)

        return {
            'is_helpful': feedback.is_helpful,
            'created': created,
            'updated': not created,
        }

    # ----------------------------------------------------------------------------- #
    # Get the current user's feedback for a location.                               #
    #                                                                               #
    # Args:                                                                         #
    #   user: User instance                                                         #
    #   location: Location instance                                                 #
    #                                                                               #
    # Returns:                                                                      #
    #   str or None: 'yes' if helpful, 'no' if not helpful, None if no feedback    #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_user_feedback(user, location):
        from starview_app.models import SummaryFeedback

        if not user or not user.is_authenticated:
            return None

        feedback = SummaryFeedback.objects.filter(
            user=user,
            location=location
        ).first()

        if feedback:
            return 'yes' if feedback.is_helpful else 'no'
        return None

    # ----------------------------------------------------------------------------- #
    # Get aggregate feedback statistics for a location.                             #
    #                                                                               #
    # Args:                                                                         #
    #   location: Location instance                                                 #
    #                                                                               #
    # Returns:                                                                      #
    #   dict: { 'helpful_count': int, 'not_helpful_count': int, 'total': int }      #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_feedback_stats(location):
        from starview_app.models import SummaryFeedback

        feedbacks = SummaryFeedback.objects.filter(location=location)
        helpful_count = feedbacks.filter(is_helpful=True).count()
        not_helpful_count = feedbacks.filter(is_helpful=False).count()

        return {
            'helpful_count': helpful_count,
            'not_helpful_count': not_helpful_count,
            'total': helpful_count + not_helpful_count,
        }

    # ----------------------------------------------------------------------------- #
    # Check if negative feedback is overwhelming and trigger regeneration.          #
    #                                                                               #
    # Requirements to trigger:                                                      #
    # - At least MIN_FEEDBACK_FOR_REGENERATION total votes (prevents manipulation)  #
    # - NEGATIVE_RATIO_THRESHOLD+ of votes are "not helpful"                        #
    # - FEEDBACK_REGENERATION_COOLDOWN_DAYS+ since last feedback-triggered regen    #
    #                                                                               #
    # Args:                                                                         #
    #   location: Location instance whose feedback to check                         #
    #                                                                               #
    # Returns:                                                                      #
    #   bool: True if regeneration was triggered, False otherwise                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_and_trigger_regeneration(location):
        from django.conf import settings

        # Get feedback stats
        stats = SummaryFeedbackService.get_feedback_stats(location)

        # Need minimum feedback count for statistical significance
        if stats['total'] < MIN_FEEDBACK_FOR_REGENERATION:
            return False

        # Check if overwhelmingly negative
        negative_ratio = stats['not_helpful_count'] / stats['total']
        if negative_ratio < NEGATIVE_RATIO_THRESHOLD:
            return False

        # Check rate limit cooldown
        if location.last_feedback_regenerated:
            cooldown_end = location.last_feedback_regenerated + timedelta(
                days=FEEDBACK_REGENERATION_COOLDOWN_DAYS
            )
            if timezone.now() < cooldown_end:
                logger.info(
                    "Skipping feedback regeneration for location %d (cooldown active until %s)",
                    location.pk,
                    cooldown_end
                )
                return False

        # Update timestamp, mark stale, and clear general cooldown to bypass it
        location.last_feedback_regenerated = timezone.now()
        location.review_summary_stale = True
        location.last_summary_generated = None  # Bypass ReviewSummaryService's 60-min cooldown
        location.save(update_fields=['last_feedback_regenerated', 'review_summary_stale', 'last_summary_generated'])

        # Trigger regeneration
        use_celery = getattr(settings, 'CELERY_ENABLED', False)
        if use_celery:
            from starview_app.utils.tasks import generate_review_summary
            generate_review_summary.delay(location.pk)
            logger.info("Queued feedback-triggered regeneration for location %d", location.pk)
        else:
            from starview_app.services.review_summary_service import ReviewSummaryService
            ReviewSummaryService.generate_summary(location.pk)
            logger.info("Ran sync feedback-triggered regeneration for location %d", location.pk)

        return True
