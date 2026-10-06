# ----------------------------------------------------------------------------------------------------- #
# EmailSuppressionList Model - Master Email Suppression List                                            #
#                                                                                                       #
# Purpose:                                                                                              #
# Master suppression list for emails that should not receive certain types of emails.                   #
# Integrates with bounce and complaint tracking to automatically suppress problematic addresses.        #
#                                                                                                       #
# Sources:                                                                                              #
# - Hard bounces (permanent delivery failures)                                                          #
# - Spam complaints (user marked as spam)                                                               #
# - Soft bounces (3+ consecutive failures)                                                              #
# - Manual admin additions                                                                              #
# - User unsubscribe requests                                                                           #
#                                                                                                       #
# Use Cases:                                                                                            #
# - Marketing/promotional email suppression (DO suppress)                                               #
# - Transactional email monitoring (DO NOT suppress - users need password resets, etc.)                 #
# - Admin visibility and manual intervention                                                            #
#                                                                                                       #
# This list can be checked before sending marketing emails to prevent:                                  #
# - Wasting resources on undeliverable emails                                                           #
# - Damaging sender reputation with high bounce rates                                                   #
# - Legal issues from sending to unwanted recipients                                                    #
# ----------------------------------------------------------------------------------------------------- #

from django.db import models, transaction
from django.contrib.auth import get_user_model

User = get_user_model()



# ----------------------------------------------------------------------------- #
# Master suppression list for email addresses.                                  #
#                                                                               #
# Tracks emails that should be suppressed from receiving certain types          #
# of emails (primarily marketing/promotional). Provides class methods           #
# for checking suppression status and adding/removing suppressions.             #
#                                                                               #
# Note: Transactional emails (password resets, verification) should             #
# NOT be suppressed to maintain core user functionality.                        #
# ----------------------------------------------------------------------------- #
class EmailSuppressionList(models.Model):

    REASON_CHOICES = [
        ('hard_bounce', 'Hard Bounce (Permanent Failure)'),
        ('soft_bounce', 'Soft Bounce (Multiple Failures)'),
        ('complaint', 'Spam Complaint'),
        ('manual', 'Manual Addition (Admin)'),
        ('unsubscribe', 'User Unsubscribed'),
    ]

    # Email information
    email = models.EmailField(
        unique=True,
        db_index=True,
        help_text="Email address to suppress"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_suppressions',
        help_text="User associated with this email (if exists)"
    )

    # Suppression details
    reason = models.CharField(
        max_length=50,
        choices=REASON_CHOICES,
        help_text="Why this email was suppressed"
    )
    added_date = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When this email was added to suppression list"
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes or context"
    )

    # Linked records
    bounce = models.ForeignKey(
        'EmailBounce',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Related bounce record (if applicable)"
    )
    complaint = models.ForeignKey(
        'EmailComplaint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Related complaint record (if applicable)"
    )

    # Status
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether suppression is currently active"
    )

    class Meta:
        db_table = 'starview_email_suppression'
        ordering = ['-added_date']
        indexes = [
            models.Index(fields=['email', 'is_active']),
            models.Index(fields=['reason', 'added_date']),
        ]
        verbose_name = 'Email Suppression Entry'
        verbose_name_plural = 'Email Suppression List'

    def __str__(self):
        return f"{self.email} - {self.reason}"

    # Check if an email address is on the suppression list.
    # Args:
    #   email (str): Email address to check
    # Returns:
    #   bool: True if email should be suppressed, False otherwise
    @classmethod
    def is_suppressed(cls, email):
        return cls.objects.filter(email=email.lower(), is_active=True).exists()

    # Add an email to the suppression list.
    # Args:
    #   email (str): Email address to suppress
    #   reason (str): Reason for suppression (from REASON_CHOICES)
    #   bounce (EmailBounce): Related bounce record (optional)
    #   complaint (EmailComplaint): Related complaint record (optional)
    #   notes (str): Additional notes (optional)
    # Returns:
    #   EmailSuppressionList: Created or existing suppression record
    @classmethod
    @transaction.atomic
    def add_to_suppression(cls, email, reason, bounce=None, complaint=None, notes=''):
        # Find user if exists
        user = None
        try:
            user = User.objects.get(email=email.lower())
        except User.DoesNotExist:
            pass

        # Create or update suppression
        suppression, created = cls.objects.select_for_update().get_or_create(
            email=email.lower(),
            defaults={
                'user': user,
                'reason': reason,
                'bounce': bounce,
                'complaint': complaint,
                'notes': notes,
                'is_active': True,
            }
        )

        priority = {'soft_bounce': 1, 'unsubscribe': 2, 'hard_bounce': 3, 'complaint': 3, 'manual': 4}
        if not created and (not suppression.is_active or priority.get(reason, 0) > priority.get(suppression.reason, 0)):
            # A later soft bounce must never downgrade a permanent/manual block
            # into one the scheduled soft-bounce cleanup can release.
            suppression.is_active = True
            suppression.reason = reason
            suppression.notes = notes
            suppression.bounce = bounce
            suppression.complaint = complaint
            suppression.save(update_fields=['is_active', 'reason', 'notes', 'bounce', 'complaint'])

        return suppression
