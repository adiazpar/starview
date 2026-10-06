import time
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import jwt
from allauth.account.models import EmailAddress
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret, hotp_value, format_hotp_value
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.conf import settings
from django.core import mail
from django.core.cache import caches
from django.test import Client, TestCase, override_settings


from starview_app.models import UserProfile


@override_settings(SOCIALACCOUNT_PROVIDERS={'google': {'APPS': [{'client_id': 'google-test', 'secret': 'test-only'}]}})
class GoogleFlowTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()

    def start(self, process='login', next_url=None, remember=False):
        csrf = self.client.get('/api/auth/providers/').json()['csrf_token']
        data = {'csrfmiddlewaretoken': csrf, 'process': process, 'remember_me': 'true' if remember else 'false'}
        if next_url is not None:
            data['next'] = next_url
        response = self.client.post('/accounts/google/login/', data)
        self.assertEqual(response.status_code, 302)
        return parse_qs(urlparse(response.url).query)['state'][0]

    def finish(self, state, email='google@example.test', subject='google-subject', overrides=None):
        claims = {'iss': 'https://accounts.google.com', 'aud': 'google-test', 'sub': subject,
                  'email': email, 'email_verified': True, 'iat': int(time.time()), 'exp': int(time.time()) + 300}
        claims.update(overrides or {})
        # allauth trusts the ID token fetched directly from Google's TLS token
        # endpoint. Mock that transport while retaining issuer/audience/expiry checks.
        token = jwt.encode(claims, 'fixture-signing-key-at-least-32-bytes', algorithm='HS256')
        with patch('allauth.socialaccount.providers.oauth2.client.OAuth2Client.get_access_token', return_value={
            'access_token': 'test-access', 'id_token': token,
        }), self.captureOnCommitCallbacks(execute=True):
            return self.client.get('/accounts/google/login/callback/', {'state': state, 'code': 'test-code'})

    def test_signup_and_returning_subject_queue_one_welcome(self):
        self.assertEqual(self.finish(self.start()).url, '/')
        account = SocialAccount.objects.get(provider='google')
        self.assertFalse(account.user.userprofile.two_factor_enabled)
        self.assertFalse(self.client.get('/api/auth/status/').json()['user']['mfa_enabled'])
        self.assertFalse(account.user.has_usable_password())
        self.assertTrue(EmailAddress.objects.get(user=account.user).verified)
        self.assertEqual(len(mail.outbox), 1)
        self.client.logout()
        self.assertEqual(self.finish(self.start(), email='changed-provider@example.test').url, '/')
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(SocialAccount.objects.get(provider='google').user_id, account.user_id)
        self.assertEqual(User.objects.get(pk=account.user_id).email, 'google@example.test')
        self.assertEqual(len(mail.outbox), 1)

    def test_remember_choice_survives_mfa_and_is_bound_to_each_oauth_attempt(self):
        self.finish(self.start())
        user = SocialAccount.objects.get(provider='google').user
        secret = generate_totp_secret()
        TOTP.activate(user, secret)
        UserProfile.objects.filter(user=user).update(two_factor_enabled=True)
        for remember in (True, False):
            self.client.logout()
            state = self.start(remember=remember)
            self.start(remember=not remember)  # Another tab must not replace this choice.
            pending = self.finish(state)
            self.assertEqual(pending.url, '/accounts/2fa/authenticate/')
            self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
            code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
            with patch('allauth.mfa.totp.internal.auth.TOTP.validate_code', return_value=True):
                response = self.client.post(pending.url, {'method': 'totp', 'code': code})
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 2592000 if remember else '')
            self.assertEqual(self.client.session['remember_me'], remember)
            session = self.client.session
            session['last_activity'] = time.time() - 7201
            session.save()
            self.assertEqual(self.client.get('/api/auth/status/').json()['authenticated'], remember)

    def test_saved_authenticator_does_not_override_disabled_two_factor(self):
        self.finish(self.start())
        user = SocialAccount.objects.get(provider='google').user
        TOTP.activate(user, generate_totp_secret())
        self.assertFalse(user.userprofile.two_factor_enabled)
        self.client.logout()
        self.assertEqual(self.finish(self.start()).url, '/')
        status = self.client.get('/api/auth/status/').json()
        self.assertTrue(status['authenticated'])
        self.assertFalse(status['user']['mfa_enabled'])

    def test_matching_contact_guides_linking_and_different_contact_creates_separate_account(self):
        existing = User.objects.create_user(username='standard', email='standard@example.test', password='Valid-Password123!')
        EmailAddress.objects.create(user=existing, email=existing.email, verified=True, primary=True)
        response = self.finish(self.start(), email=existing.email)
        self.assertIn('/social-account-exists', response.url)
        self.assertFalse(SocialAccount.objects.exists())
        self.finish(self.start(), email='different@example.test')
        self.assertNotEqual(SocialAccount.objects.get(provider='google').user_id, existing.pk)

    def test_google_cannot_bypass_mfa_and_wrong_audience_is_rejected(self):
        self.finish(self.start())
        user = SocialAccount.objects.get(provider='google').user
        secret = generate_totp_secret()
        TOTP.activate(user, secret)
        UserProfile.objects.filter(user=user).update(two_factor_enabled=True)
        self.client.logout()
        response = self.finish(self.start())
        self.assertEqual(response.url, '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        self.assertEqual(self.client.post('/accounts/2fa/authenticate/', {'method': 'totp', 'code': code}).status_code, 302)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.client.logout()
        response = self.finish(self.start(), overrides={'aud': 'another-client'})
        self.assertIn('oauth_error', response.url)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_google_entry_requires_csrf_and_unsupported_token_route_is_closed(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.get('/accounts/google/login/').status_code, 405)
        self.assertEqual(client.post('/accounts/google/login/').status_code, 403)
        self.assertEqual(client.get('/accounts/google/login/token/').status_code, 404)

    def test_connect_binds_to_account_version_at_initiation(self):
        self.finish(self.start())
        user = SocialAccount.objects.get(provider='google').user
        state = self.start('connect')
        # Credential changes keep the current session but invalidate the old
        # authorization attempt even if fresh recent proof remains available.
        UserProfile.objects.filter(user=user).update(security_version=1)
        session = self.client.session
        session['identity_version'] = 1
        session.save()
        response = self.finish(state, email='second@example.test', subject='second-subject')
        self.assertIn('reauthentication_required', response.url)
        self.assertFalse(SocialAccount.objects.filter(uid='second-subject').exists())

    def test_connect_rejects_state_for_another_initiating_account(self):
        self.finish(self.start())
        state = self.start('connect')
        session = self.client.session
        states = session['socialaccount_states']
        states[state][0]['starview_connect_user'] = -1
        session['socialaccount_states'] = states
        session.save()
        response = self.finish(state, email='second@example.test', subject='second-subject')
        self.assertIn('reauthentication_required', response.url)
        self.assertFalse(SocialAccount.objects.filter(uid='second-subject').exists())

    @override_settings(DEBUG=True, INTERNAL_IPS=[])
    def test_login_and_connect_return_to_frontend_after_backend_callback(self):
        self.client = Client(HTTP_HOST='localhost:8000')
        response = self.finish(self.start(next_url='/explore?view=map#nearby'))
        self.assertEqual(response.url, 'http://localhost:5173/explore?view=map#nearby')
        user = SocialAccount.objects.get(provider='google').user
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': user.pk, 'at': time.time(), 'method': 'test', 'mfa': False}
        session.save()
        response = self.finish(self.start('connect', '/profile?social_connected=true'))
        self.assertEqual(response.url, 'http://localhost:5173/profile?social_connected=true')

    @override_settings(DEBUG=False, ACCOUNT_DEFAULT_HTTP_PROTOCOL='https')
    def test_production_callback_preserves_relative_frontend_path(self):
        response = self.finish(self.start(next_url='/profile?social_connected=true'))
        self.assertEqual(response.url, '/profile?social_connected=true')


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase


@override_settings(SOCIALACCOUNT_PROVIDERS={'google': {'APPS': [{'client_id': 'google-test', 'secret': 'test-only'}]}})
class ConcurrentGoogleTests(TransactionTestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        from starview_app.services import badge_service
        badge_service._BADGE_CACHE_BY_SLUG.clear()
        badge_service._BADGE_CACHE_BY_CATEGORY.clear()

    def test_disconnect_while_callback_waits_does_not_create_new_profile(self):
        user = User.objects.create_user(username='revoking-google', email='original@example.test')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        account = SocialAccount.objects.create(user=user, provider='google', uid='revoking-subject')
        claims = {'iss': 'https://accounts.google.com', 'aud': 'google-test', 'sub': account.uid,
                  'email': 'changed-provider@example.test', 'email_verified': True,
                  'iat': int(time.time()), 'exp': int(time.time()) + 300}
        token = jwt.encode(claims, 'fixture-signing-key-at-least-32-bytes', algorithm='HS256')
        client = Client()
        csrf = client.get('/api/auth/providers/').json()['csrf_token']
        response = client.post('/accounts/google/login/', {'csrfmiddlewaretoken': csrf, 'process': 'login'})
        state = parse_qs(urlparse(response.url).query)['state'][0]
        started = Event()
        callback_pid = []

        def callback():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    callback_pid.append(cursor.fetchone()[0])
                started.set()
                return client.get('/accounts/google/login/callback/', {'state': state, 'code': 'test-code'})
            finally:
                connection.close()

        with patch('allauth.socialaccount.providers.oauth2.client.OAuth2Client.get_access_token', return_value={
            'access_token': 'test-access', 'id_token': token,
        }), ThreadPoolExecutor(max_workers=1) as executor:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=user.pk)
                future = executor.submit(callback)
                self.assertTrue(started.wait(5))
                blocked = False
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT wait_event FROM pg_stat_activity WHERE pid = %s', [callback_pid[0]])
                        row = cursor.fetchone()
                    if row and row[0] == 'transactionid':
                        blocked = True
                        break
                    time.sleep(.01)
                self.assertTrue(blocked, 'Callback never waited for the disconnect account lock')
                account.delete()
                UserProfile.objects.filter(user=user).update(security_version=1)
            response = future.result(timeout=5)
        self.assertIn('oauth_error', response.url)
        self.assertFalse(client.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(SocialAccount.objects.exists())

    def test_simultaneous_callbacks_create_one_identity_and_one_welcome(self):
        ready = Barrier(2)
        claims = {'iss': 'https://accounts.google.com', 'aud': 'google-test', 'sub': 'concurrent-subject',
                  'email': 'concurrent-google@example.test', 'email_verified': True,
                  'iat': int(time.time()), 'exp': int(time.time()) + 300}
        token = jwt.encode(claims, 'fixture-signing-key-at-least-32-bytes', algorithm='HS256')

        def callback():
            close_old_connections()
            try:
                client = Client()
                csrf = client.get('/api/auth/providers/').json()['csrf_token']
                response = client.post('/accounts/google/login/', {'csrfmiddlewaretoken': csrf, 'process': 'login'})
                state = parse_qs(urlparse(response.url).query)['state'][0]
                ready.wait(timeout=10)
                response = client.get('/accounts/google/login/callback/', {'state': state, 'code': 'test-code'})
                return response.status_code, client.get('/api/auth/status/').json()
            finally:
                close_old_connections()

        with patch('allauth.socialaccount.providers.oauth2.client.OAuth2Client.get_access_token', return_value={
            'access_token': 'test-access', 'id_token': token,
        }), ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(callback)
            second = executor.submit(callback)
            responses = [first.result(timeout=20), second.result(timeout=20)]
        for code, data in responses:
            self.assertEqual(code, 302)
            self.assertTrue(data['authenticated'])
        self.assertEqual(responses[0][1]['user']['id'], responses[1][1]['user']['id'])
        self.assertEqual(User.objects.filter(email=claims['email']).count(), 1)
        self.assertEqual(SocialAccount.objects.filter(uid=claims['sub']).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
