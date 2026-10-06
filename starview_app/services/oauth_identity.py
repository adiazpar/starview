"""Serialize a verified provider subject before allauth reads or writes its link."""

from django.contrib.auth import get_user_model
from django.db import connection
from allauth.socialaccount.models import SocialAccount


def lock_provider_subject(provider, uid):
    if not connection.in_atomic_block:
        raise RuntimeError('Provider identity changes require an atomic callback')
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', [f'starview.oauth:{provider}:{uid}'])


def lock_callback_identity(request, sociallogin):
    lock_provider_subject(sociallogin.account.provider, sociallogin.account.uid)
    identity = SocialAccount.objects.filter(
        provider=sociallogin.account.provider, uid=sociallogin.account.uid,
    ).values_list('pk', 'user_id').first()
    owner_id = identity[1] if identity else None
    # The state has not yet been assigned while populate_user is running. The
    # authenticated session's account is also locked for an explicit connection.
    if request.user.is_authenticated and owner_id is None:
        owner_id = request.user.pk
    if owner_id is not None:
        user = get_user_model().objects.select_for_update().filter(pk=owner_id).first()
        from django.core.exceptions import PermissionDenied
        if user is None or (identity and not SocialAccount.objects.filter(
            pk=identity[0], user_id=owner_id, provider=sociallogin.account.provider,
            uid=sociallogin.account.uid,
        ).exists()):
            # A disconnect/revocation can win the account lock while the callback
            # waits. Never reinterpret that returning credential as a new signup.
            raise PermissionDenied('Account changed while completing provider authentication')
        if user and request.user.is_authenticated and user.pk == request.user.pk:
            if request.session.get('identity_version', 0) != user.userprofile.security_version:
                raise PermissionDenied('Account changed while completing provider authentication')
