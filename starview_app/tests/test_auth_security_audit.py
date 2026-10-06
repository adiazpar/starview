"""Regression cases for malformed proof, stale authority, and MFA transactions."""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

from allauth.core import context
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import (
    TOTP, SECRET_SESSION_KEY, generate_totp_secret, hotp_value, format_hotp_value,
)
from allauth.socialaccount.models import SocialAccount, SocialLogin, SocialApp
from allauth.socialaccount.providers.google.provider import GoogleProvider
from django.contrib.auth.models import User
from django.contrib.messages import SUCCESS
from django.contrib.messages.storage.cookie import CookieStorage
from django.http import HttpResponse
from django.test import TestCase, TransactionTestCase, RequestFactory, override_settings
from django.db import close_old_connections, connections
from django.contrib.sessions.backends.db import SessionStore
from rest_framework.exceptions import PermissionDenied, ValidationError, Throttled

from starview_app.models import UserProfile, AuditLog, AccountVerification
from starview_app.services.account_security import confirm_identity, mark_recent, send_verification_code
from starview_app.services.mfa_management import manage_method, recovery_codes
from starview_app.services.verification_methods import verify_code
from starview_app.tests import test_account_security


class AuthSecurityAuditTests(TestCase):
    def setUp(self):
        test_account_security.AccountSecurityTests.setUp(self)

    def prove(self):
        session = self.client.session
        session['starview_recent_auth'] = {
            'user_id': self.user.pk, 'at': time.time(), 'method': 'email_code', 'mfa': True,
        }
        # allauth's recent-proof history is needed by its enrollment flows.
        session['account_authentication_methods'] = [
            {'method': 'mfa', 'at': time.time(), 'type': 'email_code'},
        ]
        session.save()

    def change(self, action, **extra):
        return self.client.post('/api/auth/security/methods/', {'action': action, **extra},
                                content_type='application/json')

    def test_security_apis_reject_non_object_json(self):
        self.prove()
        for endpoint in ('/api/auth/security/', '/api/auth/security/code/', '/api/auth/security/methods/'):
            for payload in ([], ['code'], 'code', 1, None):
                with self.subTest(endpoint=endpoint, payload=payload):
                    response = self.client.post(endpoint, json.dumps(payload), content_type='application/json')
                    self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())

    def test_code_methods_reject_unicode_and_nested_json_without_consuming_credentials(self):
        TOTP.activate(self.user, generate_totp_secret())
        recovery = RecoveryCodes.activate(self.user)
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        for method in ('totp', 'recovery_codes', 'email_code'):
            for code in ('１２３４５６', 'é', {'code': '123456'}, ['123456'], 123456):
                with self.subTest(method=method, code=code):
                    response = self.client.post('/api/auth/security/', {'method': method, 'code': code},
                                                content_type='application/json')
                    self.assertEqual(response.status_code, 400, response.content)
        recovery.instance.refresh_from_db()
        self.assertEqual(recovery.instance.data['used_mask'], 0)
        self.assertNotIn('starview_recent_auth', self.client.session)

    def test_setup_rejects_nested_and_unicode_codes(self):
        self.prove()
        self.assertEqual(self.change('begin_totp').status_code, 200)
        for code in ('é', {'code': '123456'}, ['123456'], 123456):
            self.assertEqual(self.change('activate_totp', code=code).status_code, 400)
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())

    def test_password_cannot_confirm_after_mfa_is_enabled_during_request(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        request = RequestFactory().post('/')
        request.user = self.user
        request.session = self.client.session
        self.assertFalse(request.user.userprofile.two_factor_enabled)
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        with context.request_context(request), self.assertRaises(ValidationError):
            confirm_identity(request, {'password': 'Valid-Password123!'})
        self.assertNotIn('starview_recent_auth', request.session)

    def test_revoked_request_cannot_consume_recovery_code_or_read_codes(self):
        code = RecoveryCodes.activate(self.user).get_unused_codes()[0]
        request = RequestFactory().get('/')
        request.user = User.objects.get(pk=self.user.pk)
        request.session = self.client.session
        mark_recent(request, request.user, 'email_code', mfa=True)
        self.assertEqual(request.user.userprofile.security_version, 0)
        UserProfile.objects.filter(user=self.user).update(security_version=1)
        with context.request_context(request):
            with self.assertRaises(PermissionDenied):
                verify_code(request, request.user, 'recovery_codes', code)
            with self.assertRaises(PermissionDenied):
                recovery_codes(request)
            with self.assertRaises(PermissionDenied):
                send_verification_code(request)
        auth = Authenticator.objects.get(user=self.user, type='recovery_codes')
        self.assertIn(code, auth.wrap().get_unused_codes())
        self.assertNotIn('viewed_at', auth.data)
        self.assertFalse(AccountVerification.objects.filter(user=self.user).exists())

    def test_enrollment_changes_policy_and_revocation_before_commit_hooks(self):
        self.assertEqual(self.change('begin_totp').status_code, 200)
        secret = self.client.session[SECRET_SESSION_KEY]
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.change('activate_totp', code=code)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['enabled'])
        profile = UserProfile.objects.get(user=self.user)
        self.assertTrue(profile.two_factor_enabled)
        self.assertEqual(profile.security_version, 1)
        self.assertEqual(AuditLog.objects.filter(user=self.user, event_type='mfa_enabled').count(), 1)
        for callback in callbacks:
            callback()
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 1)
        self.assertEqual(AuditLog.objects.filter(user=self.user, event_type='mfa_enabled').count(), 1)

    def test_setup_checks_fresh_enabled_state_after_locking(self):
        request = RequestFactory().post('/')
        request.user = self.user
        request.session = self.client.session
        self.assertFalse(request.user.userprofile.two_factor_enabled)
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        with context.request_context(request), self.assertRaises(PermissionDenied):
            manage_method(request, {'action': 'begin_totp'})
        self.assertNotIn(SECRET_SESSION_KEY, request.session)

    def test_setup_and_disable_cannot_bypass_a_revoked_session(self):
        request = RequestFactory().post('/')
        request.user = self.user
        request.session = self.client.session
        self.assertEqual(request.user.userprofile.security_version, 0)
        UserProfile.objects.filter(user=self.user).update(security_version=1)
        for action in ('begin_totp', 'activate_totp', 'disable'):
            with self.subTest(action=action), context.request_context(request), self.assertRaises(PermissionDenied):
                manage_method(request, {'action': action, 'code': '123456'})
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())

    def test_recovery_regeneration_revokes_before_commit_hooks_once(self):
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        old = RecoveryCodes.activate(self.user).get_unused_codes()[0]
        self.prove()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.change('regenerate_recovery')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 1)
        self.assertNotIn(old, Authenticator.objects.get(user=self.user, type='recovery_codes').wrap().get_unused_codes())
        for callback in callbacks:
            callback()
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 1)
        self.assertEqual(AuditLog.objects.filter(user=self.user, event_type='mfa_recovery_reset').count(), 1)

    def test_destination_switch_uses_shared_failed_proof_limit(self):
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        SocialAccount.objects.create(user=self.user, provider='google', uid='proof-limit',
                                     extra_data={'email': 'factor@example.test'})
        self.prove()
        with patch('starview_app.services.mfa_management.check_proof_rate_limit', side_effect=Throttled):
            response = self.change('set_email_destination', email='factor@example.test', code='123456')
        self.assertEqual(response.status_code, 429)
        self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_email, '')

    def test_native_confirmation_hides_old_messages_and_rejects_other_methods(self):
        storage = CookieStorage(RequestFactory().get('/'))
        message = 'Signed in as a previous account.'
        storage.add(SUCCESS, message)
        cookie_response = HttpResponse()
        storage.update(cookie_response)
        self.client.cookies.update(cookie_response.cookies)
        self.assertNotContains(self.client.get('/accounts/reauthenticate/'), message)
        self.assertEqual(self.client.put('/accounts/reauthenticate/').status_code, 405)

    @override_settings(SOCIALACCOUNT_PROVIDERS={'google': {'APPS': [{'client_id': 'audit-only', 'secret': 'test-only'}]}})
    def test_pending_oauth_mfa_checks_provider_ownership(self):
        self.user.set_password('Valid-Password123!')
        self.user.save()
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        code = RecoveryCodes.activate(self.user).get_unused_codes()[0]
        account = SocialAccount.objects.create(user=self.user, provider='google', uid='pending-provider')
        self.client.logout()
        response = self.client.post('/api/auth/login/', {
            'username': self.user.username, 'password': 'Valid-Password123!',
        }, content_type='application/json')
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        session = self.client.session
        provider = GoogleProvider(RequestFactory().get('/'), app=SocialApp(provider='google', client_id='audit-only'))
        session['account_login']['signal_kwargs'] = {
            'sociallogin': SocialLogin(user=self.user, account=account, provider=provider).serialize(),
        }
        session.save()
        # A removed/reassigned link must abort even without a version change.
        account.delete()
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'recovery_codes', 'code': code})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertIn(code, Authenticator.objects.get(user=self.user, type='recovery_codes').wrap().get_unused_codes())


class RecoveryReadConcurrencyTests(TransactionTestCase):
    def setUp(self):
        test_account_security.AccountSecurityTests.setUp(self)

    def test_first_recovery_read_cannot_restore_a_concurrently_consumed_code(self):
        code = RecoveryCodes.activate(self.user).get_unused_codes()[0]
        reader_loaded = Event()
        consumer_started = Event()
        consumer_done = Event()
        mark_viewed = RecoveryCodes.mark_as_viewed

        def delayed_mark_viewed(wrapper):
            reader_loaded.set()
            self.assertTrue(consumer_started.wait(5))
            # Let the unprotected implementation consume and then overwrite the
            # code. The protected implementation keeps the consumer waiting.
            consumer_done.wait(0.2)
            mark_viewed(wrapper)

        def request_for_thread():
            request = RequestFactory().get('/')
            request.user = User.objects.get(pk=self.user.pk)
            request.session = SessionStore()
            request.session.create()
            request.session['identity_version'] = 0
            request.session['account_authentication_methods'] = [{'method': 'mfa', 'at': time.time()}]
            mark_recent(request, request.user, 'mfa', mfa=True)
            return request

        def read():
            close_old_connections()
            try:
                request = request_for_thread()
                with context.request_context(request):
                    return recovery_codes(request)
            finally:
                connections.close_all()

        def consume():
            close_old_connections()
            try:
                self.assertTrue(reader_loaded.wait(5))
                request = request_for_thread()
                consumer_started.set()
                with context.request_context(request):
                    verify_code(request, request.user, 'recovery_codes', code)
                consumer_done.set()
            finally:
                connections.close_all()

        with patch.object(RecoveryCodes, 'mark_as_viewed', delayed_mark_viewed), ThreadPoolExecutor(max_workers=2) as pool:
            reader = pool.submit(read)
            consumer = pool.submit(consume)
            reader.result(timeout=10)
            consumer.result(timeout=10)
        auth = Authenticator.objects.get(user=self.user, type='recovery_codes')
        self.assertNotIn(code, auth.wrap().get_unused_codes())
        self.assertIn('viewed_at', auth.data)
