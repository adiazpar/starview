"""Idempotent recipient events in the existing SES tables, without a new ledger."""

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.utils import timezone
from datetime import timedelta

from starview_app.models import EmailBounce, EmailComplaint, EmailSuppressionList


def _event_user(email):
    # An unverified pending address has not established account ownership yet.
    address = EmailAddress.objects.filter(email__iexact=email, verified=True).first()
    return get_user_model().objects.filter(pk=address.user_id).first() if address else None


def process_email_event(envelope, message, kind):
    if not isinstance(message, dict) or message.get('notificationType', message.get('eventType')) != kind:
        raise ValueError('Unexpected notification')
    data = message.get(kind.lower())
    key = 'bouncedRecipients' if kind == 'Bounce' else 'complainedRecipients'
    if not isinstance(data, dict) or not isinstance(data.get(key), list):
        raise ValueError('Missing recipients')
    message_id = envelope['MessageId']
    if not isinstance(message_id, str) or not 0 < len(message_id) <= 255:
        raise ValueError('Invalid message id')
    recipients = {}
    for recipient in data[key]:
        if not isinstance(recipient, dict) or not isinstance(recipient.get('emailAddress'), str):
            raise ValueError('Invalid recipient')
        email = recipient['emailAddress'].strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise ValueError('Invalid recipient') from None
        recipients[email] = recipient

    model = EmailBounce if kind == 'Bounce' else EmailComplaint
    processed = 0
    # Sorting and per-recipient locks also serialize two different events for the
    # same address, so retries/concurrency cannot inflate the soft-bounce count.
    with transaction.atomic():
        for email, recipient in sorted(recipients.items()):
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", [f'starview.mail-event:{email}'])
            if model.objects.filter(email=email, sns_message_id=message_id).exists():
                continue
            common = dict(email=email, sns_message_id=message_id, user=_event_user(email), raw_notification=message)
            if kind == 'Bounce':
                bounce_type = {'Permanent': 'hard', 'Transient': 'soft', 'Temporary': 'soft'}.get(data.get('bounceType'), 'transient')
                # Count unique recent soft failures, not redelivery attempts.
                prior = EmailBounce.objects.filter(email=email, bounce_type='soft', last_bounce_date__gte=timezone.now() - timedelta(days=30)).count()
                record = EmailBounce.objects.create(**common, bounce_type=bounce_type,
                    bounce_subtype=str(data.get('bounceSubType', 'undetermined')).lower()[:50],
                    diagnostic_code=recipient.get('diagnosticCode', ''), bounce_count=prior + 1 if bounce_type == 'soft' else 1)
                if record.should_suppress():
                    reason = 'hard_bounce' if bounce_type == 'hard' else 'soft_bounce'
                    EmailSuppressionList.add_to_suppression(email, reason, bounce=record)
                    EmailBounce.objects.filter(pk=record.pk).update(suppressed=True)
            else:
                complaint_type = data.get('complaintFeedbackType', 'other')
                if complaint_type not in dict(EmailComplaint.COMPLAINT_TYPE_CHOICES):
                    complaint_type = 'other'
                record = EmailComplaint.objects.create(**common, complaint_type=complaint_type,
                    user_agent=str(data.get('userAgent', ''))[:255], feedback_id=str(data.get('feedbackId', ''))[:255])
                # A feedback report saying "not spam" must not create a block.
                # It also cannot revoke an existing hard-bounce/manual block.
                if complaint_type != 'not-spam':
                    EmailSuppressionList.add_to_suppression(email, 'complaint', complaint=record)
                    EmailComplaint.objects.filter(pk=record.pk).update(suppressed=True)
            processed += 1
    return processed
