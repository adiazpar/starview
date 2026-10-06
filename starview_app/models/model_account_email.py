"""Durable delivery records for account mail; payloads may contain recovery links."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class AccountEmail(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                             on_delete=models.CASCADE, related_name='account_emails')
    deduplication_key = models.CharField(max_length=200, unique=True, null=True, blank=True)
    encrypted_payload = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    next_attempt_at = models.DateTimeField(default=timezone.now, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(max_length=20, default='pending')
    last_error = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['created_at']
