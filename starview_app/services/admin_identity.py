"""Keep administrator credential edits consistent with account/session ownership."""

from contextlib import contextmanager

from allauth.account.models import EmailAddress, EmailConfirmation
from django.contrib.auth import get_user_model
from django.db import transaction

from starview_app.models import UserProfile
from starview_app.services.account_events import record_account_event
from starview_app.services.account_security import revoke_account_sessions


@contextmanager
def admin_account_changes(request, user_ids):
    with transaction.atomic():
        users = list(get_user_model().objects.select_for_update().filter(
            pk__in=set(user_ids),
        ).order_by('pk'))
        previous = {user.pk: user.email for user in users}
        yield
        for user in users:
            user.refresh_from_db()
            old_email = previous[user.pk]
            revoke_account_sessions(user, keep_request=request)
            record_account_event(request, user, 'account_admin_changed', method='admin',
                                 recipients=list(dict.fromkeys([old_email, user.email])))


def synchronize_user_contact(user):
    """A direct admin contact edit selects one primary; verification stays explicit."""
    email = user.email.strip().lower()
    user.email = email
    EmailConfirmation.objects.filter(email_address__user=user).delete()
    EmailAddress.objects.filter(user=user, primary=True).exclude(email__iexact=email).update(primary=False)
    if email:
        address, _created = EmailAddress.objects.get_or_create(
            user=user, email=email, defaults={'primary': True, 'verified': False},
        )
        if not address.primary:
            address.primary = True
            address.save(update_fields=['primary'])


def save_admin_email_address(address):
    """Honor the administrator's primary/verified choices in both contact tables."""
    address.email = address.email.strip().lower()
    EmailConfirmation.objects.filter(email_address__user_id=address.user_id).delete()
    if address.primary:
        EmailAddress.objects.filter(user_id=address.user_id, primary=True).exclude(pk=address.pk).update(primary=False)
    address.save()
    if address.primary:
        get_user_model().objects.filter(pk=address.user_id).update(email=address.email)


def identity_owner_ids(model, objects):
    field = 'account__user_id' if model._meta.model_name == 'socialtoken' else 'user_id'
    return set(objects.values_list(field, flat=True))


def prepare_provider_change(previous, replacement=None):
    from allauth.socialaccount.models import SocialToken
    if previous is None or (replacement is not None and (
        previous.provider, previous.uid, previous.user_id,
    ) == (replacement.provider, replacement.uid, replacement.user_id)):
        return
    if previous.provider == 'apple':
        from starview_app.services.apple_oauth import revoke_apple_credential
        revoke_apple_credential(previous)
    if replacement is not None:
        # A token for the old subject/owner must not follow a reassigned link.
        SocialToken.objects.filter(account=previous).delete()


def reset_admin_profile(request, profile):
    from allauth.mfa.models import Authenticator
    from django.core.exceptions import PermissionDenied
    from django.utils import timezone
    with admin_account_changes(request, [profile.user_id]):
        current = UserProfile.objects.select_for_update().get(pk=profile.pk)
        if Authenticator.objects.filter(user_id=current.user_id).exists() and not request.user.has_perm('mfa.delete_authenticator'):
            raise PermissionDenied
        picture = current.profile_picture
        updates = {
            field.name: field.get_default()
            for field in UserProfile._meta.concrete_fields
            if field.editable and not field.primary_key and field.name != 'user'
        }
        updates.update(two_factor_enabled=False, two_factor_method=UserProfile.TwoFactorMethod.EMAIL,
                       two_factor_email='', updated_at=timezone.now())
        UserProfile.objects.filter(pk=current.pk).update(**updates)
        Authenticator.objects.filter(user_id=current.user_id).delete()
        if picture:
            transaction.on_commit(lambda: picture.storage.delete(picture.name))
