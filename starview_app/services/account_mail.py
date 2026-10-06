"""Transactional account-mail outbox with encrypted, short-lived message bodies.

Delivery is at least once: a process can die after the provider accepts mail but
before the receipt is stored. Database deduplication prevents duplicate enqueueing,
not that unavoidable SMTP/provider acknowledgement ambiguity.
"""

import json
import logging
from datetime import timedelta

from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from starview_app.models import AccountEmail
from starview_app.services.secret_storage import secret_cipher

logger = logging.getLogger(__name__)


def _cipher():
    return secret_cipher('account-email.v1')


def enqueue_account_email(message, *, user=None, deduplication_key=None, expires_at=None):
    """Persist before sending; failed delivery never rolls back account creation."""
    if message.attachments:
        raise ValueError('Account email does not support attachments')
    # Force header validation before queuing; never retry an invalid header forever.
    message.message()
    payload = {key: getattr(message, key) for key in (
        'subject', 'body', 'from_email', 'to', 'cc', 'bcc', 'reply_to', 'extra_headers',
    )}
    payload['alternatives'] = list(getattr(message, 'alternatives', []))
    encrypted = _cipher().encrypt(json.dumps(payload).encode()).decode()
    values = {'user': user, 'encrypted_payload': encrypted, 'expires_at': expires_at}
    if deduplication_key:
        record, created = AccountEmail.objects.get_or_create(
            deduplication_key=deduplication_key, defaults=values,
        )
    else:
        record, created = AccountEmail.objects.create(**values), True
    if created:
        transaction.on_commit(lambda: _try_delivery(record.pk), robust=True)
    return record


def _try_delivery(record_id):
    try:
        deliver_account_email(record_id)
    except Exception as exc:
        # Even database/crypto failures must not undo a committed account action.
        logger.error('Account email dispatch failed: id=%s exception=%s', record_id, type(exc).__name__)


def deliver_account_email(record_id):
    """Lock one message so concurrent workers cannot deliver it simultaneously."""
    with transaction.atomic():
        record = AccountEmail.objects.select_for_update().get(pk=record_id)
        now = timezone.now()
        if record.completed_at or record.next_attempt_at > now:
            return False
        deadline = record.expires_at or record.created_at + timedelta(days=14)
        if deadline <= now:
            record.outcome = 'expired'
            record.completed_at = now
            record.encrypted_payload = ''
            record.save(update_fields=['outcome', 'completed_at', 'encrypted_payload'])
            return False
        record.attempts += 1
        try:
            payload = json.loads(_cipher().decrypt(record.encrypted_payload.encode()))
            alternatives = payload.pop('alternatives')
            payload['headers'] = payload.pop('extra_headers')
            message = EmailMultiAlternatives(**payload)
            for content, mimetype in alternatives:
                message.attach_alternative(content, mimetype)
            # Uses the configured delivery backend, including Apple's relay filter.
            sent = message.send(fail_silently=False)
            if sent == 0 and getattr(message, 'starview_suppressed', False):
                record.outcome = 'suppressed'
            elif sent == 1:
                record.outcome = 'sent'
            else:
                raise RuntimeError('Email transport did not accept the message')
            record.completed_at = now
            record.encrypted_payload = ''
            record.last_error = ''
        except Exception as exc:
            record.last_error = type(exc).__name__[:100]
            record.next_attempt_at = now + timedelta(seconds=min(3600, 30 * 2 ** min(record.attempts, 7)))
            logger.warning('Account email will retry: id=%s exception=%s', record.pk, record.last_error)
        record.save(update_fields=[
            'attempts', 'next_attempt_at', 'completed_at', 'outcome', 'encrypted_payload', 'last_error',
        ])
        return record.outcome == 'sent'
