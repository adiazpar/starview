# ----------------------------------------------------------------------------------------------------- #
# Email Utilities - Helper Functions for Email Sending                                                  #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides utility functions for safe email sending with suppression list checking.                     #
# Prevents sending to bounced or complained email addresses.                                            #
#                                                                                                       #
# Key Functions:                                                                                        #
# - is_email_suppressed(): Check if email is on suppression list                                        #
# - send_email_safe(): Send email with automatic suppression check                                      #
# - get_email_statistics(): Get bounce/complaint metrics                                                #
# ----------------------------------------------------------------------------------------------------- #

import logging
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from starview_app.models import EmailSuppressionList, EmailBounce, EmailComplaint

logger = logging.getLogger(__name__)



# ----------------------------------------------------------------------------- #
# Check if an email address is on the suppression list.                         #
#                                                                               #
# Args:                                                                         #
#   email (str): Email address to check                                         #
#                                                                               #
# Returns:                                                                      #
#   tuple: (bool, str) - (is_suppressed, reason)                                #
#   - is_suppressed: True if email should not receive emails                    #
#   - reason: Reason for suppression (if suppressed)                            #
#                                                                               #
# Example:                                                                      #
#   >>> is_suppressed, reason = is_email_suppressed('user@example.com')         #
#   >>> if is_suppressed:                                                       #
#   >>>     print(f"Cannot send: {reason}")                                     #
# ----------------------------------------------------------------------------- #
def is_email_suppressed(email):
    
    suppression = EmailSuppressionList.objects.filter(
        email=email.lower(),
        is_active=True
    ).first()

    if suppression:
        reason_map = {
            'hard_bounce': 'Email address does not exist (hard bounce)',
            'soft_bounce': 'Email address has repeated delivery failures',
            'complaint': 'Recipient marked emails as spam',
            'manual': 'Manually blocked by administrator',
            'unsubscribe': 'User unsubscribed from emails',
        }
        reason = reason_map.get(suppression.reason, 'Email suppressed')
        return True, reason

    return False, None



# ----------------------------------------------------------------------------- #
# Send an email with automatic suppression list checking.                       #
#                                                                               #
# This is a drop-in replacement for EmailMultiAlternatives that automatically   #
# checks the suppression list before sending.                                   #
#                                                                               #
# Args:                                                                         #
#   subject (str): Email subject line                                           #
#   text_content (str): Plain text email body                                   #
#   html_content (str): HTML email body                                         #
#   recipient_email (str): Recipient email address                              #
#   from_email (str): Sender email (defaults to DEFAULT_FROM_EMAIL)             #
#   fail_silently (bool): Whether to suppress exceptions                        #
#                                                                               #
# Returns:                                                                      #
#   tuple: (bool, str) - (success, message)                                     #
#       - success: True if email was sent, False if blocked                     #
#       - message: Success or failure message                                   #
#                                                                               #
# Example:                                                                      #
#   >>> success, msg = send_email_safe(                                         #
#   ...     subject="Welcome!",                                                 #
#   ...     text_content="Welcome to Starview",                                 #
#   ...     html_content="<h1>Welcome!</h1>",                                   #
#   ...     recipient_email="user@example.com"                                  #
#   ... )                                                                       #
#       >>> if not success:                                                     #
#       ...     logger.warning(f"Email blocked: {msg}")                         #
# ----------------------------------------------------------------------------- #
def send_email_safe(subject, text_content, html_content, recipient_email, from_email=None, fail_silently=False):
    
    # Check suppression list
    is_suppressed, reason = is_email_suppressed(recipient_email)
    if is_suppressed:
        logger.warning("Email blocked by suppression list: %s - %s", recipient_email, reason)
        return False, f"Email suppressed: {reason}"

    # Send email
    try:
        if from_email is None:
            from_email = settings.DEFAULT_FROM_EMAIL

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[recipient_email]
        )
        email.attach_alternative(html_content, "text/html")
        email.send(fail_silently=fail_silently)

        logger.info("Email sent successfully to: %s", recipient_email)
        return True, "Email sent successfully"

    except Exception as e:
        logger.error("Error sending email to %s: %s", recipient_email, e)
        if not fail_silently:
            raise
        return False, f"Error sending email: {str(e)}"



# ----------------------------------------------------------------------------- #
# Get email bounce and complaint statistics.                                    #
#                                                                               #
# Returns:                                                                      #
#   dict: Statistics including:                                                 #
#       - total_bounces: Total bounce count                                     #
#       - hard_bounces: Hard bounce count                                       #
#       - soft_bounces: Soft bounce count                                       #
#       - total_complaints: Total complaint count                               #
#       - suppressed_emails: Total suppressed email count                       #
#       - bounce_rate: Percentage of emails that bounced                        #
#       - complaint_rate: Percentage of emails that resulted in complaints      #
#                                                                               #
# Example:                                                                      #
#   >>> stats = get_email_statistics()                                          #
#   >>> print(f"Bounce rate: {stats['bounce_rate']:.2f}%")                      #
#   >>> print(f"Complaint rate: {stats['complaint_rate']:.2f}%")                #
# ----------------------------------------------------------------------------- #
def get_email_statistics():

    from django.db.models import Count, Q

    # Count bounces by type
    bounce_stats = EmailBounce.objects.aggregate(
        total=Count('id'),
        hard=Count('id', filter=Q(bounce_type='hard')),
        soft=Count('id', filter=Q(bounce_type='soft')),
    )

    # Count complaints
    complaint_count = EmailComplaint.objects.count()

    # Count suppressed emails
    suppressed_count = EmailSuppressionList.objects.filter(is_active=True).count()

    # Calculate rates (placeholder - would need total sent count from SES metrics)
    # For now, use bounce/complaint counts as raw numbers
    stats = {
        'total_bounces': bounce_stats['total'],
        'hard_bounces': bounce_stats['hard'],
        'soft_bounces': bounce_stats['soft'],
        'total_complaints': complaint_count,
        'suppressed_emails': suppressed_count,
        'bounce_rate': 0.0,  # Would calculate: (total_bounces / total_sent) * 100
        'complaint_rate': 0.0,  # Would calculate: (total_complaints / total_sent) * 100
    }

    return stats



# ----------------------------------------------------------------------------- #
# Add multiple emails to suppression list at once.                              #
#                                                                               #
# Useful for:                                                                   #
# - Importing bounce lists from previous email service                          #
# - Bulk unsubscribe processing                                                 #
# - Manual cleanup operations                                                   #
#                                                                               #
# Args:                                                                         #
#   email_list (list): List of email addresses to suppress                      #
#   reason (str): Reason for suppression (default: 'manual')                    #
#   notes (str): Additional notes                                               #
#                                                                               #
# Returns:                                                                      #
#   dict: Summary of operation                                                  #
#       - suppressed: Count of newly suppressed emails                          #
#       - already_suppressed: Count of already suppressed emails                #
#       - failed: List of emails that failed to suppress                        #
#                                                                               #
# Example:                                                                      #
#   >>> result = bulk_suppress_emails(                                          #
#   ...     ['bad1@example.com', 'bad2@example.com'],                           #
#   ...     reason='manual',                                                    #
#   ...     notes='Bulk cleanup'                                                #
#   ... )                                                                       #
#   >>> print(f"Suppressed {result['suppressed']} emails")                      #
# ----------------------------------------------------------------------------- #
def bulk_suppress_emails(email_list, reason='manual', notes=''):

    suppressed = 0
    already_suppressed = 0
    failed = []

    for email in email_list:
        try:
            email = email.lower().strip()
            if not email:
                continue

            # Check if already suppressed
            if EmailSuppressionList.objects.filter(email=email, is_active=True).exists():
                already_suppressed += 1
                continue

            # Add to suppression list
            EmailSuppressionList.add_to_suppression(
                email=email,
                reason=reason,
                notes=notes
            )
            suppressed += 1

        except Exception as e:
            logger.error("Error suppressing %s: %s", email, e)
            failed.append(email)

    return {
        'suppressed': suppressed,
        'already_suppressed': already_suppressed,
        'failed': failed,
    }
