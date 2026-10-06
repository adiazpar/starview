import json
import time
from unittest.mock import Mock, patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from starview_app.models import AccountEmail, AuditLog


@override_settings(APPLE_OAUTH_ENABLED=True, APPLE_NOTIFICATION_AUDIENCES=['app.starview.test'], DEBUG=False)
class AppleNotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='apple-notification', email='apple-events@example.test')
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.now = int(time.time())
        self.account = SocialAccount.objects.create(user=self.user, provider='apple', uid='notification-subject',
                                                   extra_data={'apple_authorized_at': self.now - 10})
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')

    def send(self, kind, event_time=None, overrides=None):
        claims = {'iss': 'https://appleid.apple.com', 'aud': 'app.starview.test', 'iat': self.now,
                  'jti': 'notification-id', 'events': json.dumps({'type': kind, 'sub': self.account.uid,
                  'event_time': self.now if event_time is None else event_time})}
        claims.update(overrides or {})
        payload = jwt.encode(claims, self.key, algorithm='RS256', headers={'kid': 'test'})
        with patch('starview_app.services.apple_oauth._apple_keys.get_signing_key_from_jwt', return_value=Mock(key=self.key.public_key())):
            return self.client.post('/accounts/apple/notifications/', json.dumps({'payload': payload}), content_type='application/json')

    def test_revocation_uses_signed_authorization_time_revokes_sessions_and_is_idempotent(self):
        self.assertEqual(self.send('consent-revoked', self.now - 20).status_code, 200)
        self.assertTrue(SocialAccount.objects.filter(pk=self.account.pk).exists())
        self.assertEqual(self.send('consent-revoked', self.now - 5).status_code, 200)
        self.assertFalse(SocialAccount.objects.filter(pk=self.account.pk).exists())
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(self.send('consent-revoked', self.now - 5).status_code, 200)
        self.assertEqual(AccountEmail.objects.filter(user=self.user).count(), 1)
        event = AuditLog.objects.get(user=self.user, event_type='provider_disconnected')
        self.assertEqual(event.metadata['method'], 'provider_notification')

    def test_relay_events_ignore_older_and_duplicate_notifications(self):
        self.send('email-disabled', self.now - 2)
        self.send('email-enabled', self.now - 3)
        self.account.refresh_from_db()
        self.assertFalse(self.account.extra_data['apple_relay_enabled'])
        self.send('email-enabled', self.now - 1)
        self.send('email-disabled', self.now - 2)
        self.account.refresh_from_db()
        self.assertTrue(self.account.extra_data['apple_relay_enabled'])

    def test_invalid_signed_claims_cannot_change_account(self):
        for overrides in ({'aud': 'wrong'}, {'iat': self.now - 31 * 86400}, {'jti': ''}, {'jti': []}):
            with self.subTest(overrides=overrides):
                self.assertEqual(self.send('account-deleted', overrides=overrides).status_code, 400)
        self.assertEqual(self.send('account-deleted', event_time=True).status_code, 400)
        self.assertTrue(SocialAccount.objects.filter(pk=self.account.pk).exists())

    def test_key_fetch_outage_requests_retry(self):
        with patch('starview_app.services.apple_oauth._apple_keys.get_signing_key_from_jwt', side_effect=jwt.PyJWKClientConnectionError('offline')):
            response = self.client.post('/accounts/apple/notifications/', json.dumps({'payload': 'token'}), content_type='application/json')
        self.assertEqual(response.status_code, 503)
        self.assertTrue(SocialAccount.objects.filter(pk=self.account.pk).exists())
