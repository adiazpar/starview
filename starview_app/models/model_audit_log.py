# ----------------------------------------------------------------------------------------------------- #
# This model_audit_log.py file defines the AuditLog model:                                              #
#                                                                                                       #
# Purpose:                                                                                              #
# Records security-relevant events for compliance, forensics, and incident response. Tracks all         #
# authentication events, admin actions, and authorization failures with detailed context.               #
#                                                                                                       #
# Key Features:                                                                                         #
# - Comprehensive event tracking: Records WHO did WHAT, WHEN, WHERE, and HOW                            #
# - Database storage: Events stored in this model, archived to R2 for long-term retention               #
# - User relationship: Nullable ForeignKey supports logging for anonymous and deleted users             #
# - IP address tracking: Captures source IP for geographic and security analysis                        #
# - Metadata storage: JSONField stores event-specific context (e.g., failed username, resource ID)      #
# - Immutable records: No update/delete methods - audit logs are append-only by design                  #
#                                                                                                       #
# Event Types:                                                                                          #
# Authentication: login_success, login_failed, login_locked, logout, registration, password_change      #
# Admin Actions: location_verified, location_unverified, user_promoted, content_moderated               #
# Authorization: permission_denied, access_forbidden                                                    #
#                                                                                                       #
# Security Note:                                                                                        #
# This model stores sensitive security data. Access should be restricted to staff/superusers only.      #
# Audit logs should be regularly backed up and retained per your security policy.                       #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.db import models
from django.contrib.auth.models import User
from django.utils.timezone import now


# ----------------------------------------------------------------------------- #
# Model to record security-relevant events for audit trail.                     #
#                                                                               #
# Stores detailed information about authentication events, admin actions, and   #
# authorization failures. Provides immutable audit trail for compliance and     #
# incident response.                                                            #
# ----------------------------------------------------------------------------- #
class AuditLog(models.Model):

    # Event type choices (commonly logged security events):
    EVENT_TYPE_CHOICES = [
        # Authentication events:
        ('login_success', 'Login Success'),
        ('login_failed', 'Login Failed'),
        ('login_locked', 'Login Locked (Account Lockout)'),
        ('logout', 'Logout'),
        ('registration_success', 'Registration Success'),
        ('registration_failed', 'Registration Failed'),
        ('password_reset_requested', 'Password Reset Requested'),
        ('password_changed', 'Password Changed'),

        # Admin actions:
        ('location_verified', 'Location Verified'),
        ('location_unverified', 'Location Unverified'),
        ('content_moderated', 'Content Moderated'),

        # Authorization events:
        ('permission_denied', 'Permission Denied'),
        ('access_forbidden', 'Access Forbidden'),
    ]

    # Core event data:
    event_type = models.CharField(max_length=50, choices=EVENT_TYPE_CHOICES, db_index=True, help_text="Type of security event")
    timestamp = models.DateTimeField(default=now, db_index=True, help_text="When the event occurred")
    success = models.BooleanField(default=True, help_text="Whether the action succeeded or failed")
    message = models.TextField(help_text="Human-readable description of the event")

    # User information:
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text="User who performed the action (null for anonymous or deleted users)"
    )
    username = models.CharField(
        max_length=150,
        blank=True,
        db_index=True,
        help_text="Username attempted (for failed logins when user doesn't exist)"
    )

    # Request context:
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        db_index=True,
        help_text="IP address where the request originated"
    )
    user_agent = models.TextField(
        blank=True,
        help_text="Browser/client user agent string"
    )

    # Additional context:
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional event-specific data (JSON format)"
    )


    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp', 'event_type']),
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['ip_address', '-timestamp']),
        ]
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'


    # String representation for admin interface and debugging:
    def __str__(self):
        user_display = self.username or (self.user.username if self.user else 'anonymous')
        return f"{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')} - {self.event_type} - {user_display}"


    # Prevent accidental modification of audit logs:
    def save(self, *args, **kwargs):
        # Only allow creation, not updates (audit logs are immutable):
        if self.pk is not None:
            raise ValueError("Audit logs cannot be modified after creation")
        super().save(*args, **kwargs)


    # Prevent deletion of audit logs:
    def delete(self, *args, **kwargs):
        raise ValueError("Audit logs cannot be deleted")
