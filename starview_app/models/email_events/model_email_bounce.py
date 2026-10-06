# ----------------------------------------------------------------------------------------------------- #
# EmailBounce Model - AWS SES Bounce Tracking                                                           #
#                                                                                                       #
# Purpose:                                                                                              #
# Tracks email bounces from AWS SES with detailed metrics and suppression logic.                        #
# Receives real-time notifications from AWS SNS webhooks when emails bounce.                            #
#                                                                                                       #
# Bounce Types:                                                                                         #
# - Hard: Permanent delivery failure (invalid email, domain doesn't exist)                              #
# - Soft: Temporary failure (mailbox full, server temporarily unavailable)                              #
# - Transient: Temporary issue (connection timeout, throttling)                                         #
#                                                                                                       #
# Action Rules:                                                                                         #
# - Hard bounce: Immediate suppression, never send again                                                #
# - Soft bounce (3+ times): Add to suppression list                                                     #
# - Transient: Monitor only, no suppression                                                             #
#                                                                                                       #
# Integration:                                                                                          #
# AWS SES → AWS SNS → Django webhook endpoints → EmailBounce model                                      #
# ----------------------------------------------------------------------------------------------------- #

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()



# ----------------------------------------------------------------------------- #
# Tracks email bounces from AWS SES.                                            #
#                                                                               #
# Records bounce events with detailed metadata including bounce type,           #
# diagnostic codes, and SNS notification payloads for investigation.            #
# Implements business logic to determine when an email should be suppressed.    #
# ----------------------------------------------------------------------------- #
class EmailBounce(models.Model):
    
    BOUNCE_TYPE_CHOICES = [
        ('hard', 'Hard Bounce (Permanent)'),
        ('soft', 'Soft Bounce (Temporary)'),
        ('transient', 'Transient (Connection Issue)'),
    ]

    BOUNCE_SUBTYPE_CHOICES = [
        ('undetermined', 'Undetermined'),
        ('general', 'General'),
        ('no_email', 'Mailbox Does Not Exist'),
        ('suppressed', 'Address Suppressed'),
        ('mailbox_full', 'Mailbox Full'),
        ('message_too_large', 'Message Too Large'),
        ('content_rejected', 'Content Rejected'),
        ('attachment_rejected', 'Attachment Rejected'),
    ]

    # Email information
    email = models.EmailField(db_index=True, help_text="Email address that bounced")
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_bounces',
        help_text="User associated with this email (if exists)"
    )

    # Bounce details
    bounce_type = models.CharField(
        max_length=20,
        choices=BOUNCE_TYPE_CHOICES,
        db_index=True,
        help_text="Type of bounce (hard/soft/transient)"
    )
    bounce_subtype = models.CharField(
        max_length=50,
        choices=BOUNCE_SUBTYPE_CHOICES,
        default='undetermined',
        help_text="Specific reason for bounce"
    )

    # Tracking
    bounce_count = models.PositiveIntegerField(
        default=1,
        help_text="Number of times this email has bounced"
    )
    first_bounce_date = models.DateTimeField(
        auto_now_add=True,
        help_text="First time this email bounced"
    )
    last_bounce_date = models.DateTimeField(
        auto_now=True,
        help_text="Most recent bounce"
    )

    # AWS metadata
    sns_message_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text="AWS SNS message ID; unique with the recipient email"
    )
    diagnostic_code = models.TextField(
        blank=True,
        help_text="SMTP diagnostic message from receiving server"
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

    class Meta:
        constraints = [models.UniqueConstraint(fields=['sns_message_id', 'email'], name='unique_bounce_recipient_event')]
        db_table = 'starview_email_bounce'
        ordering = ['-last_bounce_date']
        indexes = [
            models.Index(fields=['email', '-last_bounce_date']),
            models.Index(fields=['bounce_type', 'suppressed']),
        ]
        verbose_name = 'Email Bounce'
        verbose_name_plural = 'Email Bounces'

    def __str__(self):
        return f"{self.email} - {self.bounce_type} ({self.bounce_count}x)"

    # Determine if this email should be added to suppression list.
    # Rules:
    # - Hard bounce: Always suppress immediately
    # - Soft bounce: Suppress after 3 consecutive bounces
    # - Transient: Never suppress (temporary issues)
    def should_suppress(self):
        if self.bounce_type == 'hard':
            return True
        elif self.bounce_type == 'soft' and self.bounce_count >= 3:
            return True
        return False
