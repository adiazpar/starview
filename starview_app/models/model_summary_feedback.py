# ----------------------------------------------------------------------------------------------------- #
# This model_summary_feedback.py file defines the SummaryFeedback model:                              #
#                                                                                                     #
# Purpose:                                                                                            #
# Stores user feedback on AI-generated review summaries. Used to track whether users find             #
# summaries helpful, enabling analytics and future prompt improvements.                               #
#                                                                                                     #
# Key Features:                                                                                       #
# - One feedback per user per location (unique_together constraint)                                   #
# - Tracks is_helpful boolean for simple Yes/No feedback                                              #
# - Stores summary_hash to correlate feedback with specific summary versions                          #
# - Timestamps for audit trail and analytics                                                          #
# ----------------------------------------------------------------------------------------------------- #

from django.db import models
from django.contrib.auth.models import User


class SummaryFeedback(models.Model):
    # Relationships:
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='summary_feedbacks',
        help_text="The user who submitted feedback"
    )
    location = models.ForeignKey(
        'Location',
        on_delete=models.CASCADE,
        related_name='summary_feedbacks',
        help_text="The location whose summary was rated"
    )

    # Feedback data:
    is_helpful = models.BooleanField(
        help_text="True if user found the summary helpful, False if not"
    )
    summary_hash = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text="MD5 hash of the summary text when feedback was given"
    )

    # Timestamps:
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One feedback per user per location:
        unique_together = ('user', 'location')
        # Index for analytics queries (count helpful/not helpful per location):
        indexes = [
            models.Index(fields=['location', 'is_helpful']),
        ]
        verbose_name = 'Summary Feedback'
        verbose_name_plural = 'Summary Feedback'

    def __str__(self):
        feedback_type = "helpful" if self.is_helpful else "not helpful"
        return f"{self.user.username}'s feedback on {self.location.name}: {feedback_type}"
