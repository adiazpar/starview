"""Contact ownership rules shared by signup, recovery, and account changes.

Provider subjects identify credentials. A provider's current email is descriptive
metadata, not an additional Starview recovery address or an ownership reservation.
"""

from contextlib import contextmanager

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.functions import Lower, Trim
from rest_framework.exceptions import ValidationError


EMAIL_CONSTRAINTS = {
    'starview_email_owner_unique', 'starview_user_email_ci_unique',
    'starview_address_email_ci_unique', 'unique_verified_email',
}


def email_owners(email):
    normalized = email.strip().lower()
    return get_user_model().objects.alias(
        contact=Lower(Trim('email')), address=Lower(Trim('emailaddress__email')),
    ).filter(
        Q(contact=normalized) | Q(address=normalized),
    ).distinct()


def is_email_conflict(exc):
    return getattr(getattr(exc.__cause__, 'diag', None), 'constraint_name', None) in EMAIL_CONSTRAINTS


@contextmanager
def email_change_transaction():
    """Convert a concurrent ownership loss into the same ordinary validation error."""
    try:
        with transaction.atomic():
            yield
    except IntegrityError as exc:
        if is_email_conflict(exc):
            raise ValidationError({'email': 'This email address is already registered.'}) from None
        raise


def verified_primary(user):
    return user.is_active and EmailAddress.objects.filter(
        user=user, primary=True, verified=True, email__iexact=user.email,
    ).exists()


def request_email_change(request, new_email):
    from django.conf import settings
    from django.core.exceptions import ValidationError as DjangoValidationError
    from django.core.validators import validate_email
    from django.core.mail import EmailMultiAlternatives
    from django.contrib.sites.shortcuts import get_current_site
    from django.template.loader import render_to_string
    from django.utils import translation
    from starview_app.services.account_security import require_recent, locked_account
    from starview_app.services.account_mail import enqueue_account_email

    require_recent(request)
    try:
        validate_email(new_email)
    except DjangoValidationError:
        raise ValidationError('Please enter a valid email address.') from None
    with email_change_transaction(), locked_account(request) as user:
        if user.email.lower() == new_email:
            raise ValidationError('This is already your current email address.')
        if email_owners(new_email).exclude(pk=user.pk).exists():
            raise ValidationError('This email address is already registered.')

        # One pending change per account. Replacing it invalidates every earlier
        # link; it never changes the active contact before mailbox verification.
        EmailAddress.objects.filter(user=user, primary=False, verified=False).delete()
        address, _ = EmailAddress.objects.get_or_create(
            user=user, email=new_email, defaults={'verified': False, 'primary': False},
        )
        if address.verified:
            # Old secondary addresses are not a permanent authorization to change
            # recovery. Require fresh proof even if one survived a legacy flow.
            address.verified = False
            address.save(update_fields=['verified'])
        address.send_confirmation(request)

        context = {'user': user, 'old_email': user.email, 'new_email': new_email,
                   'site_name': get_current_site(request).name}
        with translation.override(user.userprofile.language_preference):
            subject = render_to_string('account/email/email_change_subject.txt', context).strip()
            body = render_to_string('account/email/email_change_message.txt', context)
            html = render_to_string('account/email/email_change_message.html', context)
        message = EmailMultiAlternatives(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email])
        message.attach_alternative(html, 'text/html')
        enqueue_account_email(message, user=user)
        from starview_app.services.account_events import record_account_event
        record_account_event(request, user, 'email_change_requested', notify=False)


def confirm_email_change(request, key):
    """Consume a valid confirmation and update primary ownership atomically."""
    from allauth.account.models import EmailConfirmation
    from django.http import Http404
    from starview_app.services.account_security import revoke_account_sessions
    from starview_app.utils.adapters import send_welcome_email

    # Lock the user before re-reading the key, matching account updates/cleanup.
    user_id = EmailConfirmation.objects.filter(key=key.lower()).values_list('email_address__user_id', flat=True).first()
    if user_id is None:
        raise Http404
    with email_change_transaction():
        user = get_user_model().objects.select_for_update().filter(pk=user_id, is_active=True).first()
        confirmation = EmailConfirmation.objects.select_related('email_address').filter(
            key=key.lower(), email_address__user_id=user_id,
        ).first()
        if user is None or confirmation is None or confirmation.sent is None or confirmation.key_expired():
            raise Http404
        address = EmailAddress.objects.select_for_update().get(pk=confirmation.email_address_id)
        if address.verified:
            raise Http404
        had_verified_contact = EmailAddress.objects.filter(user=user, primary=True, verified=True).exists()
        old_email = user.email
        confirmation.email_address = address
        if not confirmation.confirm(request):
            raise ValidationError('This email address could not be verified.')
        address.set_as_primary()
        EmailAddress.objects.filter(user=user).exclude(pk=address.pk).delete()
        user.refresh_from_db()
        if had_verified_contact and old_email.lower() != user.email.lower():
            revoke_account_sessions(user)
            from starview_app.services.account_events import record_account_event
            record_account_event(request, user, 'email_changed', recipients=[old_email, user.email])
        elif not had_verified_contact:
            send_welcome_email(request, user)
        return address


def expire_pending_email_changes():
    """Reuse the weekly maintenance run; never delete an established account."""
    from datetime import timedelta
    from django.conf import settings
    from django.utils import timezone
    cutoff = timezone.now() - timedelta(days=settings.ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS)
    pending = EmailAddress.objects.filter(primary=False, verified=False)
    user_ids = pending.exclude(emailconfirmation__sent__gte=cutoff).values_list('user_id', flat=True).distinct()
    count = 0
    for user_id in list(user_ids):
        with transaction.atomic():
            if not get_user_model().objects.select_for_update().filter(pk=user_id).exists():
                continue
            stale = pending.filter(user_id=user_id).exclude(emailconfirmation__sent__gte=cutoff)
            count += stale.count()
            stale.delete()
    return count
