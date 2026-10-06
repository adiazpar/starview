import json
import time
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
from django.conf import settings
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, RequestFactory, SimpleTestCase, TestCase, override_settings
from allauth.account.models import EmailAddress
from allauth.account.signals import user_signed_up
from allauth.socialaccount.models import SocialAccount, SocialApp, SocialLogin, SocialToken
from allauth.socialaccount.providers.apple.views import AppleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Error

from django_project.apple_oauth import apple_app_from_env
from starview_app.models import UserBadge, UserProfile
from starview_app.services import badge_service
from starview_app.utils.adapters import CustomAccountAdapter, CustomSocialAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from django.contrib.auth.models import AnonymousUser


def private_key():
    return ec.generate_private_key(ec.SECP256R1()).private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    ).decode()


def apple_app():
    return {'client_id': 'app.starview.test', 'key': 'TESTTEAM', 'secret': 'TESTKEY',
            'settings': {'certificate_key': private_key()}}


class AppleConfigurationTests(SimpleTestCase):
    @patch('starview_app.utils.oauth_signals.audit_oauth')
    def test_authentication_diagnostics_never_log_provider_token_response(self, _audit):
        request = RequestFactory().get('/')
        exception = OAuth2Error('invalid_client; access_token=test-secret-that-must-not-be-logged')
        with self.assertLogs('starview_app.utils.adapters', level='WARNING') as captured:
            with self.assertRaises(ImmediateHttpResponse):
                CustomSocialAccountAdapter().on_authentication_error(request, Mock(id='apple'), exception=exception)
        self.assertIn('reason=invalid_client', captured.output[0])
        self.assertNotIn('test-secret-that-must-not-be-logged', captured.output[0])

    @override_settings(DEBUG=True)
    def test_login_redirect_rejects_external_destinations(self):
        adapter = CustomAccountAdapter()
        for next_url in ('https://attacker.example', '//attacker.example', '/\\attacker.example'):
            request = RequestFactory().get('/', {'next': next_url})
            self.assertEqual(adapter.get_login_redirect_url(request), 'http://localhost:5173/')
        request = RequestFactory().get('/', {'next': '/profile?connect=apple'})
        self.assertEqual(adapter.get_login_redirect_url(request), 'http://localhost:5173/profile?connect=apple')

    def test_absent_and_partial_configuration(self):
        self.assertIsNone(apple_app_from_env({}))
        with self.assertRaises(ImproperlyConfigured):
            apple_app_from_env({'APPLE_CLIENT_ID': 'app.starview.test'})

    def test_key_validation_and_escaped_newlines(self):
        env = {'APPLE_CLIENT_ID': 'app.starview.test', 'APPLE_TEAM_ID': 'TESTTEAM',
               'APPLE_KEY_ID': 'TESTKEY', 'APPLE_PRIVATE_KEY': private_key().replace('\n', '\\n')}
        self.assertIn('BEGIN PRIVATE KEY', apple_app_from_env(env)['settings']['certificate_key'])
        env['APPLE_PRIVATE_KEY'] = 'not-a-key'
        with self.assertRaises(ImproperlyConfigured):
            apple_app_from_env(env)


class AppleFlowTests(TestCase):
    def setUp(self):
        badge_service._BADGE_CACHE_BY_SLUG.clear()
        cache.clear()  # test_settings uses only an isolated in-memory cache
        self.app = apple_app()
        self.config = override_settings(APPLE_OAUTH_ENABLED=True, SOCIALACCOUNT_PROVIDERS={
            'apple': {'APPS': [self.app]}, 'google': {},
        })
        self.config.enable()
        self.addCleanup(self.config.disable)
        revoke = patch('starview_app.services.apple_oauth.requests.post', return_value=Mock(status_code=200))
        revoke.start()
        self.addCleanup(revoke.stop)
        self.client = Client(enforce_csrf_checks=True, HTTP_ACCEPT_LANGUAGE='es-ES,es;q=0.9,en;q=0.8')
        self.signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def sign_in_fixture(self, user):
        self.client.force_login(user, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': user.pk, 'at': time.time(), 'method': 'test', 'mfa': False}
        session.save()

    def start(self, process='login', next_url='/', remember=False):
        config = self.client.get('/api/auth/providers/')
        self.assertEqual(config.status_code, 200)
        self.assertEqual(set(config.json()), {'apple', 'csrf_token'})
        self.assertIn('no-store', config['Cache-Control'])
        response = self.client.post('/accounts/apple/login/', {
            'csrfmiddlewaretoken': config.json()['csrf_token'], 'process': process, 'next': next_url,
            'remember_me': 'true' if remember else 'false',
        })
        self.assertEqual(response.status_code, 302)
        query = parse_qs(urlparse(response.url).query)
        self.assertEqual(query['client_id'], [self.app['client_id']])
        self.assertEqual(query['response_mode'], ['form_post'])
        return query['state'][0]

    def finish(self, state, subject='apple-user', email='observer@example.test', name=True, overrides=None):
        claims = {'iss': 'https://appleid.apple.com', 'aud': self.app['client_id'],
                  'sub': subject, 'email': email, 'email_verified': 'true',
                  'iat': int(time.time()), 'exp': int(time.time()) + 300}
        claims.update(overrides or {})
        token = jwt.encode(claims, self.signing_key, algorithm='RS256', headers={'kid': 'test-signing-key'})
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.signing_key.public_key()))
        jwk.update(kid='test-signing-key', alg='RS256')
        # Simulate Apple's cross-site POST with no regular SameSite=Lax session cookie.
        original = self.client.cookies.pop(settings.SESSION_COOKIE_NAME)
        response = self.client.post('/accounts/apple/login/callback/', {
            'code': 'test-code', 'state': state, 'id_token': token,
            'user': json.dumps({'name': {'firstName': 'Star', 'lastName': 'Observer'}}) if name else '',
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.cookies['apple-login-session']['httponly'])
        self.assertNotIn(settings.SESSION_COOKIE_NAME, response.cookies)
        self.client.cookies[settings.SESSION_COOKIE_NAME] = original
        key_response = Mock()
        key_response.json.return_value = {'keys': [jwk]}
        with patch('allauth.socialaccount.providers.apple.client.AppleOAuth2Client.get_access_token', return_value={
            'access_token': 'test-access-token', 'refresh_token': 'test-refresh-token', 'id_token': token,
        }), patch('requests.sessions.Session.get', return_value=key_response), self.captureOnCommitCallbacks(execute=True):
            return self.client.get(response.url)

    def test_initiation_requires_post_and_csrf(self):
        self.assertEqual(self.client.get('/accounts/apple/login/').status_code, 405)
        self.assertEqual(self.client.post('/accounts/apple/login/').status_code, 403)

    def test_remember_choice_matches_password_login_and_connect_preserves_it(self):
        for remember in (True, False):
            self.client.logout()
            response = self.finish(self.start(remember=remember))
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 2592000 if remember else '')
            self.assertEqual(self.client.session['remember_me'], remember)
            self.finish(self.start('connect', remember=not remember))
            self.assertEqual(self.client.session['remember_me'], remember)

    @override_settings(DEBUG=True, INTERNAL_IPS=[])
    def test_connect_state_returns_to_frontend_after_backend_callback(self):
        self.client.defaults['HTTP_HOST'] = 'localhost:8000'
        user = User.objects.create_user(username='apple-connect-redirect', email='redirect@example.test')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        self.sign_in_fixture(user)
        response = self.finish(self.start('connect', '/profile?social_connected=true'), email=user.email)
        self.assertEqual(response.url, 'http://localhost:5173/profile?social_connected=true')

    @override_settings(DEBUG=False, ACCOUNT_DEFAULT_HTTP_PROTOCOL='https')
    def test_production_callback_preserves_relative_frontend_path(self):
        response = self.finish(self.start(next_url='/explore?view=map'))
        self.assertEqual(response.url, '/explore?view=map')

    def test_pending_email_mfa_encrypts_tokens_and_preserves_revocation_credential(self):
        import re

        self.finish(self.start(), email='pending-relay@private.icloud.com')
        account = SocialAccount.objects.get(provider='apple')
        UserProfile.objects.filter(user=account.user).update(two_factor_enabled=True)
        self.client.logout()
        response = self.finish(self.start(next_url='/profile?security=1', remember=True), email='pending-relay@private.icloud.com')
        self.assertEqual(response.url, '/accounts/2fa/authenticate/')
        pending = self.client.session['account_login']
        self.assertIn('starview_oauth_token_v1', pending['signal_kwargs']['sociallogin']['token'])
        self.assertFalse('test-refresh-token' in json.dumps(pending))
        self.assertFalse('test-access-token' in json.dumps(pending))
        csrf = self.client.get('/api/auth/providers/').json()['csrf_token']
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(response.url, {'method': 'email_code', 'action': 'send_code', 'csrfmiddlewaretoken': csrf})
        code = re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'code': code, 'csrfmiddlewaretoken': csrf})
        self.assertEqual(response.url, '/profile?security=1')
        self.assertTrue(self.client.session['remember_me'])
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 2592000)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(self.client.session['oauth_account_id'], account.pk)
        self.assertTrue(self.client.session['starview_recent_auth']['mfa'])
        credential = SocialToken.objects.get(account=account)
        self.assertTrue(credential.token_secret.startswith('apple-fernet-v1:'))
        self.assertFalse('test-refresh-token' in credential.token_secret)
        from starview_app.services.apple_oauth import revoke_apple_credential
        with patch('starview_app.services.apple_oauth.requests.post', return_value=Mock(status_code=200)) as revoke:
            self.assertTrue(revoke_apple_credential(account))
        self.assertEqual(revoke.call_args.kwargs['data']['token'], 'test-refresh-token')

    def test_signup_profile_verified_email_badge_and_returning_login(self):
        response = self.finish(self.start(), email='hidden@privaterelay.appleid.com')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, '/')
        account = SocialAccount.objects.get(provider='apple', uid='apple-user')
        user = account.user
        self.assertFalse(user.userprofile.two_factor_enabled)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.first_name, 'Star')
        self.assertEqual(user.userprofile.user_id, user.id)
        self.assertTrue(EmailAddress.objects.filter(user=user, verified=True).exists())
        self.assertTrue(UserBadge.objects.filter(user=user, badge__slug='pioneer').exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn('access_token', account.extra_data)
        self.assertNotIn('refresh_token', account.extra_data)
        self.assertNotIn('id_token', account.extra_data)
        credential = SocialToken.objects.get(account=account)
        self.assertEqual(credential.token, '')
        self.assertNotIn('test-refresh-token', credential.token_secret)
        self.assertTrue(credential.token_secret.startswith('apple-fernet-v1:'))
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.client.logout()
        response = self.finish(self.start(), email='hidden@privaterelay.appleid.com', name=False)
        self.assertEqual(response.url, '/')
        status = self.client.get('/api/auth/status/').json()
        self.assertTrue(status['authenticated'])
        self.assertFalse(status['user']['mfa_enabled'])
        user.refresh_from_db()
        self.assertEqual(user.first_name, 'Star')
        self.assertEqual(User.objects.filter(id=user.id).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(UserBadge.objects.filter(user=user, badge__slug='pioneer').count(), 1)

    def test_saved_authenticator_does_not_override_disabled_two_factor(self):
        from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
        self.finish(self.start())
        user = SocialAccount.objects.get(provider='apple').user
        TOTP.activate(user, generate_totp_secret())
        self.assertFalse(user.userprofile.two_factor_enabled)
        self.client.logout()
        self.assertEqual(self.finish(self.start()).url, '/')
        status = self.client.get('/api/auth/status/').json()
        self.assertTrue(status['authenticated'])
        self.assertFalse(status['user']['mfa_enabled'])

    def test_invalid_state_does_not_exchange_tokens(self):
        self.start()
        with patch('allauth.socialaccount.providers.apple.client.AppleOAuth2Client.get_access_token') as exchange:
            response = self.client.get('/accounts/apple/login/callback/finish/?state=wrong&code=test-code')
            self.assertEqual(response.status_code, 302)
            self.assertIn('oauth_error', response.url)
            exchange.assert_not_called()

    def test_wrong_audience_is_rejected(self):
        response = self.finish(self.start(), overrides={'aud': 'another-app'})
        self.assertIn('oauth_error', response.url)
        self.assertFalse(SocialAccount.objects.filter(provider='apple').exists())

    def test_expired_or_wrong_issuer_token_is_rejected(self):
        for claims in ({'exp': int(time.time()) - 300}, {'iss': 'https://attacker.example'}):
            with self.subTest(claims=claims):
                response = self.finish(self.start(), overrides=claims)
                self.assertIn('oauth_error', response.url)
                self.assertFalse(SocialAccount.objects.filter(provider='apple').exists())

    def test_can_disconnect_one_of_two_providers_but_never_the_last(self):
        user = User.objects.create_user(username='two-methods', email='two@example.test')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        apple = SocialAccount.objects.create(user=user, provider='apple', uid='apple-existing')
        google = SocialAccount.objects.create(user=user, provider='google', uid='google-existing')
        self.sign_in_fixture(user)
        csrf = self.client.get('/api/auth/providers/').json()['csrf_token']
        self.assertEqual(self.client.delete(f'/api/users/me/disconnect-social/{apple.id}/', HTTP_X_CSRFTOKEN=csrf).status_code, 200)
        self.assertEqual(self.client.delete(f'/api/users/me/disconnect-social/{google.id}/', HTTP_X_CSRFTOKEN=csrf).status_code, 400)
        self.assertTrue(SocialAccount.objects.filter(pk=google.pk).exists())

    def test_password_is_an_alternative_only_with_verified_primary_email(self):
        user = User.objects.create_user(username='pending-email', email='pending@example.test', password='test-password')
        email = EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=False)
        account = SocialAccount.objects.create(user=user, provider='apple', uid='pending-apple')
        self.sign_in_fixture(user)
        csrf = self.client.get('/api/auth/providers/').json()['csrf_token']
        url = f'/api/users/me/disconnect-social/{account.id}/'
        self.assertEqual(self.client.delete(url, HTTP_X_CSRFTOKEN=csrf).status_code, 403)
        self.assertTrue(SocialAccount.objects.filter(pk=account.pk).exists())
        email.verified = True
        email.save()
        self.sign_in_fixture(user)
        self.assertEqual(self.client.delete(url, HTTP_X_CSRFTOKEN=csrf).status_code, 200)

    def test_linking_conflicts_and_disconnect_guard(self):
        user = User.objects.create_user(username='existing', email='existing@example.test', password='test-password')
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        response = self.finish(self.start(), email=user.email)
        self.assertIn('social-account-exists', response.url)
        self.assertFalse(SocialAccount.objects.filter(provider='apple').exists())
        self.sign_in_fixture(user)
        response = self.finish(self.start('connect', '/profile?social_connected=true'), email=user.email)
        self.assertIn('/profile', response.url)
        account = SocialAccount.objects.get(provider='apple')
        self.assertEqual(account.user_id, user.id)
        self.assertEqual(self.client.get('/api/users/me/social-accounts/').json()['count'], 1)
        token = self.client.get('/api/auth/providers/').json()['csrf_token']
        user.set_unusable_password(); user.save()
        self.sign_in_fixture(user)
        self.assertEqual(self.client.delete(f'/api/users/me/disconnect-social/{account.id}/', HTTP_X_CSRFTOKEN=token).status_code, 400)
        user.set_password('test-password'); user.save()
        self.sign_in_fixture(user)
        self.assertEqual(self.client.delete(f'/api/users/me/disconnect-social/{account.id}/', HTTP_X_CSRFTOKEN=token).status_code, 200)

    def test_apple_login_preserves_mfa_challenge_and_relay_preferences(self):
        from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret, hotp_value, format_hotp_value
        self.finish(self.start())
        account = SocialAccount.objects.get(provider='apple')
        account.extra_data.update(apple_relay_enabled=False, apple_relay_event_time=int(time.time()) - 1)
        account.save()
        secret = generate_totp_secret()
        TOTP.activate(account.user, secret)
        UserProfile.objects.filter(user=account.user).update(two_factor_enabled=True)
        self.client.logout()
        response = self.finish(self.start())
        self.assertEqual(response.url, '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        account.refresh_from_db()
        self.assertFalse(account.extra_data['apple_relay_enabled'])
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        csrf = self.client.get('/api/auth/providers/').json()['csrf_token']
        self.assertEqual(self.client.post('/accounts/2fa/authenticate/', {'method': 'totp', 'code': code, 'csrfmiddlewaretoken': csrf}).status_code, 302)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_google_and_apple_share_verified_signup_badge_signal(self):
        for provider in ('google', 'apple'):
            with self.subTest(provider=provider):
                user = User.objects.create_user(username=f'{provider}-signup')
                account = SocialAccount.objects.create(user=user, provider=provider, uid=f'{provider}-subject')
                login = SocialLogin(user=user, account=account)
                user_signed_up.send(sender=User, request=None, user=user, sociallogin=login)
                self.assertFalse(UserBadge.objects.filter(user=user, badge__slug='pioneer').exists())
                EmailAddress.objects.create(user=user, email=f'{provider}@example.test', verified=True, primary=True)
                user_signed_up.send(sender=User, request=None, user=user, sociallogin=login)
                self.assertTrue(UserBadge.objects.filter(user=user, badge__slug='pioneer').exists())


class AccountLinkingTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='profile@example.test')
        self.other = User.objects.create_user(username='other', email='other@example.test')
        self.request = RequestFactory().get('/')
        self.request.user = AnonymousUser()
        self.request.session = {}
        self.adapter = CustomSocialAccountAdapter()

    def social_login(self, provider, email, uid='new-subject', process='login'):
        login = SocialLogin(user=User(), account=SocialAccount(provider=provider, uid=uid, extra_data={'email': email}))
        login.state = {'process': process}
        return login

    def test_matches_guide_both_providers_without_silently_linking(self):
        initial_users = User.objects.count()
        EmailAddress.objects.create(user=self.owner, email='pending@example.test', verified=False)
        SocialAccount.objects.create(user=self.owner, provider='google', uid='old-google', extra_data={'email': 'provider@example.test'})
        for provider in ('google', 'apple'):
            for email in ('PROFILE@example.test', 'PENDING@example.test'):
                with self.subTest(provider=provider, email=email):
                    with self.assertRaises(ImmediateHttpResponse) as result:
                        self.adapter.pre_social_login(self.request, self.social_login(provider, email))
                    self.assertIn(f'/social-account-exists?provider={provider}', result.exception.response.url)
        self.assertEqual(User.objects.count(), initial_users)
        self.assertEqual(SocialAccount.objects.count(), 1)

    def test_provider_email_metadata_is_not_a_contact_reservation(self):
        SocialAccount.objects.create(user=self.owner, provider='google', uid='old-google', extra_data={'email': 'metadata@example.test'})
        for provider in ('google', 'apple'):
            self.adapter.pre_social_login(self.request, self.social_login(provider, 'metadata@example.test'))

    def test_subject_wins_over_changed_email(self):
        SocialAccount.objects.create(user=self.owner, provider='apple', uid='existing-subject')
        self.adapter.pre_social_login(self.request, self.social_login('apple', self.other.email, uid='existing-subject'))

    def test_explicit_link_handles_different_email_and_rejects_other_owner(self):
        self.request.user = self.owner
        self.request.session['starview_recent_auth'] = {'user_id': self.owner.pk, 'at': time.time()}
        self.adapter.pre_social_login(self.request, self.social_login('apple', 'relay@privaterelay.appleid.com', process='connect'))
        with self.assertRaises(ImmediateHttpResponse) as result:
            self.adapter.pre_social_login(self.request, self.social_login('apple', self.other.email, process='connect'))
        self.assertIn('email_conflict', result.exception.response.url)
        SocialAccount.objects.create(user=self.other, provider='apple', uid='owned-subject')
        with self.assertRaises(ImmediateHttpResponse) as result:
            self.adapter.pre_social_login(self.request, self.social_login('apple', 'unique@example.test', uid='owned-subject', process='connect'))
        self.assertIn('social_already_connected', result.exception.response.url)
