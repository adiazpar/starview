"""Shared security receipts and notifications; never include credential material."""

import logging

from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.translation import gettext_lazy as _

from starview_app.services.account_mail import enqueue_account_email
from starview_app.utils.audit_logger import get_client_ip, log_auth_event

logger = logging.getLogger(__name__)

EVENT_MESSAGES = {
    'password_changed': _('Your Starview password was changed.'),
    'email_change_requested': _('A change to your Starview email was requested.'),
    'email_changed': _('Your Starview account email was changed.'),
    'provider_connected': _('A sign-in provider was connected to your Starview account.'),
    'provider_disconnected': _('A sign-in provider was disconnected from your Starview account.'),
    'mfa_enabled': _('Two-factor authentication was enabled for your Starview account.'),
    'mfa_disabled': _('Two-factor authentication was disabled for your Starview account.'),
    'mfa_method_added': _('An authenticator app was added to your Starview account.'),
    'mfa_method_removed': _('An authenticator app was removed from your Starview account.'),
    'mfa_email_changed': _('The email used for Starview verification codes was changed. Your main account email was not changed.'),
    'mfa_recovery_reset': _('New two-factor recovery codes were generated for your Starview account.'),
    'account_admin_changed': _('A Starview administrator changed your account access or permissions.'),
}


def credential_changed(request, user, event_type, **kwargs):
    """Rotate other sessions and emit one receipt for a credential mutation."""
    from starview_app.services.account_security import revoke_account_sessions
    with transaction.atomic():
        user.__class__.objects.select_for_update().get(pk=user.pk)
        revoke_account_sessions(user, keep_request=request)
        record_account_event(request, user, event_type, **kwargs)


def record_account_event(request, user, event_type, *, method=None, provider=None,
                         notify=True, recipients=None):
    """Call inside the account mutation's transaction whenever available.

    The outbox is durable before delivery; a mail-provider outage cannot fail the
    action. Audit errors are isolated so invalid request metadata cannot turn a
    successful authentication or provider callback into a server error.
    """
    message = EVENT_MESSAGES[event_type]
    metadata = {key: value for key, value in {'method': method, 'provider': provider}.items() if value}
    if request.user.is_authenticated and request.user.pk != user.pk:
        metadata['actor_id'] = request.user.pk
    try:
        with transaction.atomic():
            log_auth_event(request, event_type, user=user, message=str(message), metadata=metadata)
    except Exception as exc:
        logger.error('Account audit failed: event=%s exception=%s', event_type, type(exc).__name__)
    if not notify:
        return
    with translation.override(user.userprofile.language_preference):
        context = {
            'user': user, 'site_name': get_current_site(request).name, 'current_site': get_current_site(request),
            'client_ip': get_client_ip(request), 'ip': get_client_ip(request),
            'timestamp': timezone.now(), 'user_agent': request.META.get('HTTP_USER_AGENT', '')[:512],
            'security_message': str(message), 'provider': provider,
        }
        prefix = 'account/email/password_changed' if event_type == 'password_changed' else 'account/email/security_changed'
        subject = render_to_string(prefix + '_subject.txt', context).strip()
        body = render_to_string(prefix + '_message.txt', context)
        html = render_to_string(prefix + '_message.html', context)
    # Separate messages avoid exposing one mailbox to another in a recipient list.
    for email in dict.fromkeys(recipients or [user.email]):
        if email:
            email_message = EmailMultiAlternatives(subject, body, settings.DEFAULT_FROM_EMAIL, [email])
            email_message.attach_alternative(html, 'text/html')
            enqueue_account_email(email_message, user=user)
