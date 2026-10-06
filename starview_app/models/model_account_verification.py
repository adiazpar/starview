"""One-use email challenges bound to a sign-in or recent-confirmation session."""

import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class AccountVerification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    session_digest = models.CharField(max_length=64)
    email = models.EmailField(max_length=254)
    code_digest = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True)
