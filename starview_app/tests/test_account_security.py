import re
import time
from datetime import timedelta

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret, hotp_value, format_hotp_value
from django.contrib.auth.models import User
from django.conf import settings
from django.core import mail
from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone

from starview_app.models import AccountVerification, UserProfile


class AccountSecurityTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(username='security-user', email='security@example.test')
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')

    def send_code(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/auth/security/code/')
        self.assertEqual(response.status_code, 200)
        code = re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()
        self.assertEqual(mail.outbox[-1].alternatives[0].mimetype, 'text/html')
        self.assertIn(code, mail.outbox[-1].alternatives[0].content)
        self.assertIn('logo-light.png', mail.outbox[-1].alternatives[0].content)
        return code

    def test_old_oauth_session_needs_real_confirmation(self):
        self.assertFalse(self.client.get('/api/auth/security/').json()['recent'])
        blocked = self.client.patch('/api/users/me/update-email/', {'new_email': 'new@example.test'}, content_type='application/json')
        self.assertEqual(blocked.status_code, 403)
        code = self.send_code()
        response = self.client.post('/api/auth/security/', {'code': code})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['recent'])
        self.assertEqual(self.client.post('/api/auth/security/', {'code': code}).status_code, 400)

    def test_five_failed_codes_invalidate_challenge(self):
        code = self.send_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/security/', {'code': wrong}).status_code, 400)
        challenge = AccountVerification.objects.get(user=self.user)
        self.assertEqual(challenge.attempts, 5)
        self.assertIsNotNone(challenge.used_at)
        caches['security'].clear()  # Exhausted challenge stays unusable after the rate-limit window.
        caches['default'].clear()
        self.assertEqual(self.client.post('/api/auth/security/', {'code': code}).status_code, 400)

    def test_expired_code_is_rejected(self):
        code = self.send_code()
        AccountVerification.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.post('/api/auth/security/', {'code': code}).status_code, 400)

    def test_code_cannot_be_used_by_another_session(self):
        code = self.send_code()
        challenge_id = self.client.session['account_verification_id']
        self.client.logout()
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['account_verification_id'] = challenge_id
        session.save()
        self.assertEqual(self.client.post('/api/auth/security/', {'code': code}).status_code, 400)

    def test_password_confirmation_is_recent_without_sending_mail(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(self.client.post('/api/auth/security/', {'password': 'wrong'}).status_code, 400)
        self.assertTrue(self.client.post('/api/auth/security/', {'password': 'Valid-Password123!'}).json()['recent'])
        self.assertEqual(len(mail.outbox), 0)

    def test_native_confirmation_has_readable_errors_and_safe_redirect(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        response = self.client.post('/accounts/reauthenticate/', {'password': 'wrong'})
        self.assertContains(response, 'The password was not accepted.')
        self.assertNotContains(response, 'ErrorDetail')
        self.assertFalse(self.client.get('/api/auth/security/').json()['recent'])
        response = self.client.post('/accounts/reauthenticate/?next=https://untrusted.example/', {'password': 'Valid-Password123!'})
        self.assertEqual(response.url, '/profile')
        self.assertTrue(self.client.get('/api/auth/security/').json()['recent'])

    @override_settings(TESTING=False)
    def test_status_reads_do_not_spend_confirmation_attempts(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        for _ in range(10):
            self.assertEqual(self.client.get('/api/auth/security/').status_code, 200)
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/security/', {'password': 'wrong'}).status_code, 400)
        self.assertEqual(self.client.post('/api/auth/security/', {'password': 'Valid-Password123!'}).status_code, 429)
        response = self.client.post('/accounts/reauthenticate/', {'password': 'Valid-Password123!'})
        self.assertContains(response, 'Request was throttled.')

    def test_password_login_obeys_mfa_before_creating_authenticated_session(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        secret = generate_totp_secret()
        TOTP.activate(self.user, secret)
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.client.logout()
        self.client.get('/api/auth/providers/')
        response = self.client.post('/api/auth/login/', {'username': self.user.username, 'password': 'Valid-Password123!', 'remember_me': True}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'totp', 'code': code})
        self.assertEqual(response.status_code, 302)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertTrue(self.client.get('/api/auth/security/').json()['recent'])
        self.assertTrue(self.client.session['remember_me'])
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 2592000)

    def test_remember_me_controls_cookie_lifetime_and_idle_timeout(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        for remember in (False, True):
            with self.subTest(remember=remember):
                self.client.logout()
                response = self.client.post('/api/auth/login/', {
                    'username': self.user.username, 'password': 'Valid-Password123!', 'remember_me': remember,
                }, content_type='application/json')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 2592000 if remember else '')
                self.assertEqual(self.client.session.get_expire_at_browser_close(), not remember)
                session = self.client.session
                session['last_activity'] = time.time() - 7201
                session.save()
                self.assertEqual(self.client.get('/api/auth/status/').json()['authenticated'], remember)

    @override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:5173'], CSRF_TRUSTED_ORIGINS=['http://localhost:5173'])
    def test_cors_allowlist_does_not_bypass_csrf(self):
        from django.test import Client
        client = Client(enforce_csrf_checks=True)
        allowed = client.options('/api/auth/login/', HTTP_ORIGIN='http://localhost:5173',
                                 HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST', HTTP_ACCESS_CONTROL_REQUEST_HEADERS='x-csrftoken,content-type')
        self.assertEqual(allowed['Access-Control-Allow-Origin'], 'http://localhost:5173')
        self.assertEqual(allowed['Access-Control-Allow-Credentials'], 'true')
        denied = client.options('/api/auth/login/', HTTP_ORIGIN='https://untrusted.example',
                                HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST')
        self.assertNotIn('Access-Control-Allow-Origin', denied)
        self.assertEqual(client.post('/api/auth/login/', {}, HTTP_ORIGIN='http://localhost:5173').status_code, 403)
        csrf = client.get('/api/auth/providers/').json()['csrf_token']
        self.assertEqual(client.post('/api/auth/login/', {}, HTTP_ORIGIN='https://untrusted.example', HTTP_X_CSRFTOKEN=csrf).status_code, 403)
        self.assertEqual(client.post('/api/auth/login/', {}, HTTP_ORIGIN='http://localhost:5173', HTTP_X_CSRFTOKEN=csrf).status_code, 400)

    def test_password_cannot_bypass_enrolled_mfa_but_email_is_supported(self):
        secret = generate_totp_secret()
        authenticator = TOTP.activate(self.user, secret).instance
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.assertNotIn(secret, str(authenticator.data))
        email_code = self.send_code()
        self.assertEqual(self.client.post('/api/auth/security/', {'password': 'anything'}).status_code, 400)
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        response = self.client.post('/api/auth/security/', {'method': 'totp', 'code': code})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['recent'])
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'email_code', 'code': email_code}).status_code, 200)
        self.assertTrue(Authenticator.objects.filter(pk=authenticator.pk).exists())

    def test_content_cache_eviction_preserves_session_and_security_limits(self):
        caches['security'].set('test-counter', 4)
        caches['default'].set('content', 'old')
        caches['default'].clear()
        self.assertEqual(caches['security'].get('test-counter'), 4)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_admin_does_not_repeat_verification_for_an_authenticated_staff_session(self):
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save()
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.assertEqual(self.client.get('/admin/').status_code, 200)

    def test_password_settings_preserve_current_session_revoke_others_and_notify_once(self):
        from django.test import Client
        other = Client()
        other.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        code = self.send_code()
        self.client.post('/api/auth/security/', {'code': code})
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch('/api/users/me/update-password/',
                                         {'new_password': 'New-Password123!'}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertFalse(other.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(sum('password' in message.subject.lower() for message in mail.outbox), 1)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('New-Password123!'))
        self.assertEqual(self.user.userprofile.security_version, 1)

    def test_stale_staff_proof_does_not_block_standard_admin_management(self):
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time() - settings.ACCOUNT_REAUTHENTICATION_TIMEOUT - 1, 'method': 'mfa', 'mfa': True}
        session.save()
        self.assertEqual(self.client.get('/admin/').status_code, 200)
        for path in (f'/admin/auth/user/{self.user.pk}/change/', f'/admin/auth/user/{self.user.pk}/delete/'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.post('/admin/auth/user/', {'action': 'delete_selected'}).status_code, 200)

    def test_staff_without_two_factor_has_no_mandatory_verification_route(self):
        self.user.is_staff = True
        self.user.save()
        data = self.client.get('/api/auth/status/').json()
        self.assertIsNone(data.get('verification_url'))
        self.assertNotEqual(self.client.get('/images/logo-dark.png').status_code, 302)

    def test_staff_can_remove_authenticator_and_keep_email_verification(self):
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        EmailAddress.objects.create(user=self.user, email='pending@example.test', primary=False, verified=False)
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time(), 'method': 'mfa', 'mfa': True}
        session['account_authentication_methods'] = [{'method': 'mfa', 'at': time.time()}]
        session.save()
        response = self.client.post('/api/auth/security/methods/', {'action': 'remove_totp'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(Authenticator.objects.filter(user=self.user, type='totp').exists())
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/accounts/2fa/totp/activate/').status_code, 404)

    def test_unverified_primary_cannot_enroll_mfa_even_with_verified_secondary(self):
        EmailAddress.objects.filter(user=self.user).update(verified=False)
        EmailAddress.objects.create(user=self.user, email='secondary@example.test', primary=False, verified=True)
        self.assertEqual(self.client.post('/api/auth/security/methods/', {'action': 'begin_totp'}).status_code, 403)

    def test_production_axes_handler_aggregates_account_failures_across_clients(self):
        from axes.handlers.database import AxesDatabaseHandler
        from axes.handlers.proxy import AxesProxyHandler
        from django.test import RequestFactory
        from unittest.mock import patch

        handler = AxesDatabaseHandler()
        proxy = patch.object(AxesProxyHandler, 'implementation', handler)
        proxy.start()
        self.addCleanup(proxy.stop)
        factory = RequestFactory()
        credentials = {'username': self.user.username, 'password': 'wrong-test-password'}
        for number in range(5):
            request = factory.post('/api/auth/login/', credentials,
                                   REMOTE_ADDR=f'192.0.2.{number + 1}', HTTP_USER_AGENT=f'Test client {number}')
            AxesProxyHandler.update_request(request)
            handler.user_login_failed(sender=User, credentials=credentials, request=request)
        request = factory.post('/api/auth/login/', credentials,
                               REMOTE_ADDR='192.0.2.100', HTTP_USER_AGENT='Another test client')
        AxesProxyHandler.update_request(request)
        self.assertEqual(handler.get_failures(request, credentials), 5)
        self.assertTrue(handler.is_locked(request, credentials))
