"""Bounded housekeeping run by the existing weekly maintenance command."""

from datetime import timedelta

from django.contrib.sessions.models import Session
from django.db.models import Q
from django.utils import timezone

from starview_app.models import AccountEmail, AccountVerification
from starview_app.services.account_mail import deliver_account_email


def maintain_accounts():
    now = timezone.now()
    # Short-lived links/codes are never sent after expiry. Erase their encrypted
    # bodies even if the delivery provider has been unavailable for days.
    expired = AccountEmail.objects.filter(completed_at__isnull=True).filter(
        Q(expires_at__lte=now) | Q(expires_at__isnull=True, created_at__lt=now - timedelta(days=14)),
    )
    expired.update(
        encrypted_payload='', completed_at=now, outcome='expired', last_error='',
    )
    counts = {}
    from starview_app.services.email_identity import expire_pending_email_changes
    counts['pending_email_changes'] = expire_pending_email_changes()
    for name, records in (
        ('email_receipts', AccountEmail.objects.filter(completed_at__lt=now - timedelta(days=30))),
        ('confirmation_codes', AccountVerification.objects.filter(created_at__lt=now - timedelta(days=1))),
        ('sessions', Session.objects.filter(expire_date__lt=now)),
    ):
        counts[name] = records.delete()[0]
    return counts


def retry_account_emails(*, limit=100):
    ids = list(AccountEmail.objects.filter(
        completed_at__isnull=True, next_attempt_at__lte=timezone.now(),
    ).values_list('pk', flat=True)[:limit])
    return sum(deliver_account_email(pk) for pk in ids)
