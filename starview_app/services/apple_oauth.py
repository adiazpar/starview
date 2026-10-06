"""Apple credential storage, revocation, and verified account notifications."""

import json
import time

import jwt
import requests
from cryptography.fernet import InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from allauth.socialaccount.models import SocialAccount, SocialToken
from starview_app.services.secret_storage import secret_cipher


TOKEN_PREFIX = 'apple-fernet-v1:'
APPLE_ISSUER = 'https://appleid.apple.com'
_apple_keys = jwt.PyJWKClient(f'{APPLE_ISSUER}/auth/keys', timeout=5)


class AppleRevocationError(Exception):
    """A safe diagnostic; never include the token or upstream response."""


def _cipher():
    return secret_cipher('apple.refresh-token.v1')


def store_apple_credential(sociallogin):
    if sociallogin.account.provider != 'apple' or not sociallogin.token:
        return
    refresh_token = sociallogin.token.token_secret
    if not refresh_token:
        return  # Preserve the prior refresh token when Apple does not rotate it.
    # Settings-defined apps have no database row, so allauth leaves token.app null.
    client_id = settings.SOCIALACCOUNT_PROVIDERS['apple']['APPS'][0]['client_id'].split(',')[0]
    payload = json.dumps({
        'uid': sociallogin.account.uid,
        'client_id': client_id,
        'refresh_token': refresh_token,
    }).encode()
    encrypted = TOKEN_PREFIX + _cipher().encrypt(payload).decode()
    # Keep allauth's automatic (plaintext) storage disabled. Its existing token
    # table is used only as an encrypted vault; no access/ID tokens are retained.
    with transaction.atomic():
        SocialAccount.objects.select_for_update().get(pk=sociallogin.account.pk)
        credential = SocialToken.objects.filter(account=sociallogin.account, app=None).first()
        if credential is None:
            credential = SocialToken(account=sociallogin.account)
        credential.token = ''
        credential.token_secret = encrypted
        credential.expires_at = None
        credential.save()


def revoke_apple_credential(account):
    """Revoke before local deletion. False means a legacy account has no token."""
    credential = SocialToken.objects.filter(
        account=account, token_secret__startswith=TOKEN_PREFIX,
    ).first()
    if credential is None:
        return False
    try:
        payload = json.loads(_cipher().decrypt(
            credential.token_secret[len(TOKEN_PREFIX):].encode()
        ))
        if payload['uid'] != account.uid:
            raise ValueError('Credential identity mismatch')
        app = settings.SOCIALACCOUNT_PROVIDERS['apple']['APPS'][0]
        now = int(time.time())
        client_secret = jwt.encode({
            'iss': app['key'], 'aud': APPLE_ISSUER, 'sub': payload['client_id'],
            'iat': now, 'exp': now + 300,
        }, app['settings']['certificate_key'], algorithm='ES256', headers={'kid': app['secret']})
        response = requests.post(f'{APPLE_ISSUER}/auth/revoke', data={
            'client_id': payload['client_id'], 'client_secret': client_secret,
            'token': payload['refresh_token'], 'token_type_hint': 'refresh_token',
        }, timeout=5)
        if response.status_code != 200:
            raise AppleRevocationError('Apple could not revoke authorization. Please try again.')
    except (InvalidToken, KeyError, ValueError, TypeError, requests.RequestException, ImproperlyConfigured):
        raise AppleRevocationError('Apple authorization could not be revoked. Please try again.') from None
    return True


def verify_apple_notification(payload):
    """Apple notifications omit exp; require signed identity and bounded age."""
    if not isinstance(payload, str) or len(payload) > 16384:
        raise ValueError('Invalid payload')
    signing_key = _apple_keys.get_signing_key_from_jwt(payload)
    claims = jwt.decode(
        payload, signing_key.key, algorithms=['RS256'], issuer=APPLE_ISSUER,
        audience=settings.APPLE_NOTIFICATION_AUDIENCES,
        options={'require': ['iss', 'aud', 'iat', 'jti', 'events']}, leeway=60,
    )
    now = time.time()
    if type(claims['iat']) not in (int, float) or not now - 30 * 86400 <= claims['iat'] <= now + 60:
        raise ValueError('Stale notification')
    if not isinstance(claims['jti'], str) or not claims['jti'] or len(claims['jti']) > 255:
        raise ValueError('Invalid notification id')
    event = claims['events']
    if isinstance(event, str):
        event = json.loads(event)
    if not isinstance(event, dict) or not isinstance(event.get('sub'), str) or not event['sub']:
        raise ValueError('Invalid event')
    event_time = event.get('event_time')
    if type(event_time) not in (int, float) or not 0 < event_time <= now + 60:
        raise ValueError('Invalid event time')
    return event


def process_apple_notification(event, request):
    from django.contrib.auth import get_user_model
    from starview_app.services.oauth_identity import lock_provider_subject
    from starview_app.services.account_security import revoke_account_sessions
    from starview_app.services.account_events import record_account_event
    with transaction.atomic():
        lock_provider_subject('apple', event['sub'])
        owner_id = SocialAccount.objects.filter(provider='apple', uid=event['sub']).values_list('user_id', flat=True).first()
        if owner_id is None:
            return
        user = get_user_model().objects.select_for_update().filter(pk=owner_id).first()
        account = SocialAccount.objects.select_for_update().filter(provider='apple', uid=event['sub']).first()
        if account is None or user is None:
            return  # Duplicate revocation or an account that was never linked here.
        event_type = event.get('type')
        if event_type in ('consent-revoked', 'account-deleted'):
            # A delayed notification must not remove a more recent authorization.
            authorized_at = account.extra_data.get('apple_authorized_at', int(account.last_login.timestamp()))
            if event['event_time'] < authorized_at:
                return
            account.delete()
            revoke_account_sessions(user)
            record_account_event(request, user, 'provider_disconnected', provider='apple', method='provider_notification')
        elif event_type in ('email-enabled', 'email-disabled'):
            previous_time = account.extra_data.get('apple_relay_event_time', 0)
            if event['event_time'] <= previous_time:
                return
            account.extra_data['apple_relay_enabled'] = event_type == 'email-enabled'
            account.extra_data['apple_relay_event_time'] = event['event_time']
            # QuerySet.update preserves last_login, which tracks authorization time.
            SocialAccount.objects.filter(pk=account.pk).update(extra_data=account.extra_data)
