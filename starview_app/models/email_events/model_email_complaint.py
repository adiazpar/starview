# ----------------------------------------------------------------------------------------------------- #
# EmailComplaint Model - AWS SES Spam Complaint Tracking                                                #
#                                                                                                       #
# Purpose:                                                                                              #
# Tracks spam complaints from AWS SES when recipients mark emails as spam.                              #
# Receives real-time notifications from AWS SNS via feedback loops.                                     #
#                                                                                                       #
# Complaint Flow:                                                                                       #
# When a recipient marks an email as spam, their email provider (Gmail, Yahoo, etc.) may report         #
# it back to AWS SES via feedback loops. This is critical for sender reputation.                        #
#                                                                                                       #
# Action Rules:                                                                                         #
# - Any complaint: Immediate suppression, never send again                                              #
# - Alert admin for manual review                                                                       #
# - Monitor complaint rate (must stay below 0.1% for AWS SES compliance)                                #
#                                                                                                       #
# Integration:                                                                                          #
# AWS SES → ISP Feedback Loop → AWS SNS → Django webhook endpoints → EmailComplaint model               #
# ----------------------------------------------------------------------------------------------------- #

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()



# ----------------------------------------------------------------------------- #
# Tracks spam complaints from AWS SES.                                          #
#                                                                               #
# Records when recipients mark emails as spam, including complaint type,        #
# user agent information, and full SNS notification payloads.                   #
# Critical for monitoring sender reputation and AWS SES compliance.             #
# ----------------------------------------------------------------------------- #
class EmailComplaint(models.Model):

    COMPLAINT_TYPE_CHOICES = [
        ('abuse', 'Abuse Report'),
        ('auth-failure', 'Authentication Failure'),
        ('fraud', 'Fraud Report'),
        ('not-spam', 'Not Spam (False Positive)'),
        ('other', 'Other/Unknown'),
        ('virus', 'Virus Report'),
    ]

    # Email information
    email = models.EmailField(db_index=True, help_text="Email address that complained")
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_complaints',
        help_text="User associated with this email (if exists)"
    )

    # Complaint details
    complaint_type = models.CharField(
        max_length=50,
        choices=COMPLAINT_TYPE_CHOICES,
        default='other',
        help_text="Type of complaint reported"
    )
    user_agent = models.CharField(
        max_length=255,
        blank=True,
        help_text="Email client user agent (if available)"
    )

    # Tracking
    complaint_date = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When the complaint was received"
    )

    # AWS metadata
    sns_message_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text="AWS SNS message ID; unique with the recipient email"
    )
    feedback_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Feedback loop identifier from ISP"
    )
    raw_notification = models.JSONField(
        help_text="Complete SNS notification payload"
    )

    # Status
    suppressed = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this email has been added to suppression list"
    )
    reviewed = models.BooleanField(
        default=False,
        help_text="Whether admin has reviewed this complaint"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=['sns_message_id', 'email'], name='unique_complaint_recipient_event')]
        db_table = 'starview_email_complaint'
        ordering = ['-complaint_date']
        indexes = [
            models.Index(fields=['email', '-complaint_date']),
            models.Index(fields=['reviewed', 'suppressed']),
        ]
        verbose_name = 'Email Complaint'
        verbose_name_plural = 'Email Complaints'

    def __str__(self):
        return f"{self.email} - {self.complaint_type} on {self.complaint_date.date()}"
