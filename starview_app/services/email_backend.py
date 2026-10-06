"""Respect Apple private-relay forwarding preferences at the delivery boundary."""

from copy import copy
from email.utils import parseaddr
from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend
from starview_app.services.apple_relay import disabled_apple_relay_emails


class EmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.delivery = get_connection(
            backend=settings.EMAIL_DELIVERY_BACKEND, fail_silently=fail_silently, **kwargs,
        )

    def open(self):
        return self.delivery.open()

    def close(self):
        self.delivery.close()

    def send_messages(self, email_messages):
        messages = list(email_messages or [])
        if not messages:
            return 0
        recipients = {parseaddr(address)[1].casefold() for message in messages for address in message.recipients()}
        disabled = disabled_apple_relay_emails(recipients)
        deliverable = []
        for original in messages:
            message = copy(original)
            for field in ('to', 'cc', 'bcc'):
                setattr(message, field, [address for address in getattr(original, field) if parseaddr(address)[1].casefold() not in disabled])
            if message.recipients():
                deliverable.append(message)
            else:
                # Explicit signal for the account outbox. A transport returning
                # zero is a delivery failure, not proof of deliberate filtering.
                original.starview_suppressed = True
        return self.delivery.send_messages(deliverable)
