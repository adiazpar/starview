"""Contact ownership rules shared by signup, recovery, and account changes.

Provider subjects identify OAuth credentials. A verified linked provider email can
identify password login, but is not a recovery address or ownership reservation.
"""

from contextlib import contextmanager

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.fields.json import KeyTextTransform
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


def password_login_user(identity):
    """Resolve a login name without treating provider metadata as proof of login.

    Only server-persisted Google/Apple verification claims enable an alias. The
    caller must still verify the account's local password, primary contact, and
    MFA. Primary/pending contact ownership takes precedence over stale aliases;
    multiple provider subjects may name an alias only for the same account.
    """
    users = get_user_model().objects
    identity = identity.strip().lower()
    lookup = {'email__iexact': identity} if '@' in identity else {'username__iexact': identity}
    primary = list(users.filter(**lookup)[:2])
    if primary or '@' not in identity:
        return primary[0] if len(primary) == 1 else None

    from allauth.socialaccount.models import SocialAccount

    candidates = SocialAccount.objects.filter(provider__in=('google', 'apple')).alias(
        login_email=Lower(Trim(KeyTextTransform('email', 'extra_data'))),
    ).filter(login_email=identity).values('user_id', 'provider', 'extra_data')
    owners = set()
    for account in candidates:
        claims = account['extra_data']
        # Apple returns either a boolean or the string "true". Google's current
        # and legacy claim names use booleans; a string "false" is never proof.
        if account['provider'] == 'apple':
            verified = claims.get('email_verified')
            trusted = verified is True or verified == 'true'
        else:
            evidence = [claims[key] for key in ('email_verified', 'verified_email') if key in claims]
            trusted = bool(evidence) and all(value is True for value in evidence)
        if trusted:
            owners.add(account['user_id'])
    if len(owners) != 1:
        return None
    owner_id = owners.pop()
    if email_owners(identity).exclude(pk=owner_id).exists():
        return None
    return users.filter(pk=owner_id).first()


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


def resend_primary_confirmation(request, email):
    """Replace signup links only while their primary contact is still current.

    Share allauth's mailbox limiter, and serialize with contact confirmation and
    replacement. A failed enqueue rolls back invalidation of the previous link.
    Callers deliberately return the same response for every eligibility result.
    """
    from allauth.account.models import EmailConfirmation
    from allauth.account.internal.flows.email_verification import consume_email_verification_rate_limit

    if not consume_email_verification_rate_limit(request, email):
        return False
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().filter(
            email__iexact=email, is_active=True,
        ).first()
        if user is None:
            return False
        address = EmailAddress.objects.filter(
            user=user, email__iexact=user.email, primary=True, verified=False,
        ).first()
        if address is None:
            return False
        EmailConfirmation.objects.filter(email_address=address).delete()
        address.send_confirmation(request)
        from starview_app.utils.audit_logger import log_auth_event
        import logging
        try:
            with transaction.atomic():
                log_auth_event(request, 'verification_email_resent', user=user,
                               message='Primary email verification requested.')
        except Exception as exc:
            logging.getLogger(__name__).error('Verification resend audit failed: exception=%s', type(exc).__name__)
        return True


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
