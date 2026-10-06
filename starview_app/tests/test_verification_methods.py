"""Exercise the same email/app/recovery policy through sign-in and settings."""
import re
import time
from unittest.mock import patch

from allauth.account.models import EmailAddress, EmailConfirmation
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret, hotp_value, format_hotp_value, SECRET_SESSION_KEY
from django.core import mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.test import TransactionTestCase, Client

from starview_app.models import UserProfile, AccountVerification
from starview_app.tests.test_account_security import AccountSecurityTests


class VerificationMethodTests(TransactionTestCase):
    def setUp(self):
        # TransactionTestCase flushes rows between tests; discard badge objects
        # retained by earlier test classes before exercising real signup signals.
        from starview_app.services import badge_service
        badge_service._BADGE_CACHE_BY_SLUG.clear()
        badge_service._BADGE_CACHE_BY_CATEGORY.clear()
        AccountSecurityTests.setUp(self)

    def send_code(self):
        response = self.client.post('/api/auth/security/code/')
        self.assertEqual(response.status_code, 200, response.content)
        return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()

    def confirm_email(self):
        code = self.send_code()
        response = self.client.post('/api/auth/security/', {'method': 'email_code', 'code': code})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['recent'])

    def change(self, action, **extra):
        return self.client.post('/api/auth/security/methods/', {'action': action, **extra}, content_type='application/json')

    def start_login(self, *, staff=False):
        self.user.is_staff = staff
        self.user.set_password('Valid-Password123!')
        self.user.save()
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.client.logout()
        result = self.client.post('/api/auth/login/', {'username': self.user.username, 'password': 'Valid-Password123!'}, content_type='application/json')
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def login_email_code(self):
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'action': 'send_code'})
        self.assertEqual(response.status_code, 200)
        return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()

    def test_staff_can_sign_in_with_email_without_an_app(self):
        self.start_login(staff=True)
        self.assertContains(self.client.get('/accounts/2fa/authenticate/'), 'Email code')
        code = self.login_email_code()
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'code': code})
        self.assertEqual(response.status_code, 302, response.content)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertTrue(self.client.session['starview_recent_auth']['mfa'])
        self.assertFalse(Authenticator.objects.filter(user=self.user, type='totp').exists())

    def test_email_only_two_factor_preserves_pending_login_and_rejects_unknown_method(self):
        self.start_login()
        code = self.login_email_code()
        wrong = self.client.post('/accounts/2fa/authenticate/', {'method': 'unknown', 'code': code})
        self.assertContains(wrong, 'Enter a valid verification code.')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        good = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'code': code})
        self.assertEqual(good.status_code, 302)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_pending_login_aborts_after_account_credentials_change(self):
        self.start_login()
        code = self.login_email_code()
        UserProfile.objects.filter(user=self.user).update(security_version=1)
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'code': code})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_email_code_cannot_cross_login_challenges(self):
        self.start_login()
        code = self.login_email_code()
        challenge = self.client.session['account_login_verification_id']
        self.client.get('/accounts/2fa/authenticate/?cancel=1')
        self.client.post('/api/auth/login/', {'username': self.user.username, 'password': 'Valid-Password123!'}, content_type='application/json')
        session = self.client.session
        session['account_login_verification_id'] = challenge
        session.save()
        response = self.client.post('/accounts/2fa/authenticate/', {'method': 'email_code', 'code': code})
        self.assertContains(response, 'incorrect or has expired')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_setup_requires_recent_proof_and_does_not_activate_until_valid_code(self):
        self.assertEqual(self.change('begin_totp').status_code, 403)
        self.confirm_email()
        response = self.change('begin_totp')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['qr_code'].startswith('data:image/svg+xml;base64,'))
        self.assertNotIn('secret', response.json())
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertFalse(self.user.userprofile.two_factor_enabled)
        self.assertEqual(self.change('activate_totp', code='wrong').status_code, 400)
        self.assertFalse(self.client.get('/api/auth/status/').json()['user']['mfa_enabled'])
        secret = self.client.session[SECRET_SESSION_KEY]
        code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
        response = self.change('activate_totp', code=code)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['enabled'])
        self.assertEqual(response.json()['preferred_method'], 'totp')
        self.user.refresh_from_db()
        self.assertTrue(self.user.userprofile.two_factor_enabled)
        self.assertEqual(self.client.get('/api/auth/security/recovery-codes/').status_code, 200)
        self.assertNotIn(SECRET_SESSION_KEY, self.client.session)
        self.assertEqual(self.change('activate_totp', code=code).status_code, 400)

    def test_enable_regenerate_remove_app_and_disable_keep_consistent_policy(self):
        other = Client()
        other.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        self.confirm_email()
        enabled = self.change('enable')
        self.assertEqual(enabled.status_code, 200, enabled.content)
        self.assertTrue(enabled.json()['enabled'])
        self.assertEqual(enabled.json()['preferred_method'], 'email_code')
        old_codes = self.client.get('/api/auth/security/recovery-codes/').json()['codes']
        self.assertEqual(len(old_codes), 10)
        self.assertFalse(other.get('/api/auth/status/').json()['authenticated'])
        regenerated = self.change('regenerate_recovery')
        self.assertEqual(regenerated.status_code, 200, regenerated.content)
        new_codes = self.client.get('/api/auth/security/recovery-codes/').json()['codes']
        self.assertNotEqual(old_codes, new_codes)
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'recovery_codes', 'code': old_codes[0]}).status_code, 400)
        secret = generate_totp_secret()
        TOTP.activate(self.user, secret)
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        removed = self.change('remove_totp')
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertTrue(removed.json()['enabled'])
        self.assertEqual(removed.json()['recovery_count'], 10)
        disabled = self.change('disable')
        self.assertEqual(disabled.status_code, 200, disabled.content)
        self.assertFalse(disabled.json()['enabled'])
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

        self.user.set_password('Valid-Password123!')
        self.user.save()
        self.client.logout()
        login = self.client.post('/api/auth/login/', {
            'username': self.user.username, 'password': 'Valid-Password123!',
        }, content_type='application/json')
        self.assertEqual(login.json()['redirect_url'], '/')
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_recovery_code_is_one_use_and_methods_do_not_fall_back(self):
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        code = RecoveryCodes.activate(self.user).get_unused_codes()[0]
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'email_code', 'code': code}).status_code, 400)
        good = self.client.post('/api/auth/security/', {'method': 'recovery_codes', 'code': code})
        self.assertEqual(good.status_code, 200, good.content)
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'recovery_codes', 'code': code}).status_code, 400)

    def test_staff_can_remove_app_and_turn_two_factor_off(self):
        self.user.is_staff = True
        self.user.save()
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.confirm_email()
        self.assertEqual(self.change('remove_totp').status_code, 200)
        self.assertTrue(self.client.get('/api/auth/security/methods/').json()['enabled'])
        disabled = self.change('disable')
        self.assertEqual(disabled.status_code, 200, disabled.content)
        self.assertFalse(disabled.json()['enabled'])
        self.assertFalse(disabled.json()['required'])
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())

    def test_disabled_relay_is_unavailable_and_cannot_remove_last_method(self):
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.confirm_email()
        with patch('starview_app.services.verification_methods.is_apple_relay_disabled', return_value=True):
            status = self.client.get('/api/auth/security/methods/').json()
            self.assertFalse(next(method['available'] for method in status['methods'] if method['id'] == 'email_code'))
            self.assertEqual(self.change('remove_totp').status_code, 400)
            self.assertTrue(Authenticator.objects.filter(user=self.user, type='totp').exists())

    def test_recent_proof_expiry_protects_codes_and_mutations(self):
        self.confirm_email()
        self.change('enable')
        session = self.client.session
        session['starview_recent_auth']['at'] -= settings.ACCOUNT_REAUTHENTICATION_TIMEOUT + 1
        session.save()
        self.assertEqual(self.client.get('/api/auth/security/recovery-codes/').status_code, 403)

    def test_overview_needs_no_recent_proof_but_secrets_and_changes_do(self):
        for enabled in (False, True):
            with self.subTest(enabled=enabled):
                UserProfile.objects.filter(user=self.user).update(two_factor_enabled=enabled)
                response = self.client.get('/api/auth/security/methods/')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['enabled'], enabled)
                self.assertEqual(set(response.json()), {'enabled', 'required', 'methods', 'recovery_count', 'preferred_method', 'email', 'email_choices'})
                self.assertIn('no-store', response['Cache-Control'])
                self.assertEqual(self.client.get('/api/auth/security/recovery-codes/').status_code, 403)
                self.assertEqual(self.change('begin_totp').status_code, 403)
                self.assertEqual(self.change('enable').status_code, 403)
                self.assertEqual(self.change('disable').status_code, 403)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(Client().get('/api/auth/security/methods/').status_code, 401)

    def test_switching_default_preserves_credentials_sessions_and_recent_proof(self):
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.assertEqual(self.change('set_preferred_method', method='totp').status_code, 403)
        self.confirm_email()
        proof = self.client.session['starview_recent_auth'].copy()
        for method in ('totp', 'email_code'):
            response = self.change('set_preferred_method', method=method)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['preferred_method'], method)
            self.assertEqual(self.client.get('/api/auth/security/').json()['preferred_method'], method)
            self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_method, method)
            self.assertTrue(response.json()['enabled'])
            self.assertEqual(self.client.session['starview_recent_auth'], proof)
        self.assertTrue(Authenticator.objects.filter(user=self.user, type='totp').exists())
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 0)
        self.assertEqual(len(mail.outbox), 1)  # Only the explicitly requested confirmation code.

    def test_default_rejects_unavailable_backup_and_unknown_choices_without_enabling_mfa(self):
        self.confirm_email()
        self.assertEqual(self.change('set_preferred_method', method='email_code').status_code, 400)
        self.assertFalse(UserProfile.objects.get(user=self.user).two_factor_enabled)
        self.change('enable')
        for method in ('totp', 'recovery_codes', 'unknown', None, ['email_code']):
            with self.subTest(method=method):
                self.assertEqual(self.change('set_preferred_method', method=method).status_code, 400)
        with patch('starview_app.services.verification_methods.is_apple_relay_disabled', return_value=True):
            self.assertEqual(self.change('set_preferred_method', method='email_code').status_code, 400)
        self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_method, 'email_code')

    def test_default_controls_login_and_sensitive_action_prompts_with_explicit_fallback(self):
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        for method, alternate in (('email_code', 'totp'), ('totp', 'email_code')):
            UserProfile.objects.filter(user=self.user).update(two_factor_method=method)
            self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
            response = self.client.get('/accounts/reauthenticate/')
            self.assertEqual(response.context_data['method'], method)
            self.start_login()
            response = self.client.get('/accounts/2fa/authenticate/')
            self.assertEqual(response.context_data['method'], method)
            fallback = self.client.get('/accounts/2fa/authenticate/', {'method': alternate})
            self.assertEqual(fallback.context_data['method'], alternate)
            self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_method, method)

    def test_unavailable_default_falls_back_to_an_available_method(self):
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True, two_factor_method='totp')
        self.assertEqual(self.client.get('/api/auth/security/').json()['preferred_method'], 'email_code')
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_method='email_code')
        with patch('starview_app.services.verification_methods.is_apple_relay_disabled', return_value=True):
            self.assertEqual(self.client.get('/api/auth/security/').json()['preferred_method'], 'totp')

    def test_recent_confirmation_is_reused_for_twenty_minutes_without_sliding_expiry(self):
        self.assertEqual(settings.ACCOUNT_REAUTHENTICATION_TIMEOUT, 1200)
        self.confirm_email()
        self.change('enable')
        for age, expected in ((15 * 60, 200), (1199, 200), (1201, 403)):
            session = self.client.session
            session['starview_recent_auth']['at'] = time.time() - age
            original = session['starview_recent_auth'].copy()
            session.save()
            self.assertEqual(self.client.get('/api/auth/security/recovery-codes/').status_code, expected)
            self.assertEqual(self.change('set_preferred_method', method='email_code').status_code, expected)
            self.assertEqual(self.client.session['starview_recent_auth'], original)

    def test_email_setup_cannot_enable_unavailable_email_method(self):
        self.confirm_email()
        with patch('starview_app.services.verification_methods.is_apple_relay_disabled', return_value=True):
            self.assertEqual(self.change('enable').status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.userprofile.two_factor_enabled)
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())

    def test_login_keeps_backup_link_outside_primary_verification_methods(self):
        self.start_login()
        RecoveryCodes.activate(self.user)
        response = self.client.get('/accounts/2fa/authenticate/')
        self.assertContains(response, 'Use a backup code instead')
        primary_choices = response.content.decode().split('class="account-verification-methods"')[1].split('</div>')[0]
        self.assertNotIn('method=recovery_codes', primary_choices)
        self.assertNotIn('Unavailable', primary_choices)

    def test_pending_login_does_not_display_a_previous_sign_in_message(self):
        from django.contrib.messages import SUCCESS
        from django.contrib.messages.storage.cookie import CookieStorage
        from django.http import HttpResponse
        from django.test import RequestFactory

        self.start_login()
        storage = CookieStorage(RequestFactory().get('/'))
        previous_message = 'Successfully signed in as the previous account.'
        storage.add(SUCCESS, previous_message)
        cookie_response = HttpResponse()
        storage.update(cookie_response)
        self.client.cookies.update(cookie_response.cookies)
        response = self.client.get('/accounts/2fa/authenticate/')
        self.assertNotContains(response, previous_message)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_verified_primary_is_required_for_email_codes(self):
        code = self.send_code()
        EmailAddress.objects.filter(user=self.user).update(verified=False)
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'email_code', 'code': code}).status_code, 403)

    def test_recovery_codes_are_not_cacheable(self):
        self.confirm_email()
        self.change('enable')
        response = self.client.get('/api/auth/security/recovery-codes/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertIn('Cookie', response['Vary'])

    def test_legacy_overview_opens_profile_modal_without_confirmation_page(self):
        for suffix in ('', 'totp/activate/', 'totp/deactivate/', 'recovery-codes/', 'recovery-codes/generate/', 'recovery-codes/download/'):
            path = '/accounts/2fa/' + suffix
            response = self.client.get(path)
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.url.endswith('/profile?security=1'))
            self.assertEqual(self.client.post(path).status_code, 405)

    def test_legacy_app_removal_cannot_discard_last_working_verification_method(self):
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        RecoveryCodes.activate(self.user)
        self.confirm_email()
        with patch('starview_app.services.verification_methods.is_apple_relay_disabled', return_value=True):
            response = self.client.post('/accounts/2fa/totp/deactivate/')
        self.assertEqual(response.status_code, 405)
        self.assertTrue(Authenticator.objects.filter(user=self.user, type='totp').exists())
        self.assertTrue(Authenticator.objects.filter(user=self.user, type='recovery_codes').exists())

    def test_security_mutations_require_session_and_csrf(self):
        anonymous = Client()
        self.assertEqual(anonymous.post('/api/auth/security/methods/', {'action': 'enable'}).status_code, 401)
        guarded = Client(enforce_csrf_checks=True)
        guarded.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(guarded.post('/api/auth/security/code/').status_code, 403)
        self.assertEqual(guarded.post('/api/auth/security/methods/', {'action': 'enable'}).status_code, 403)

    def test_new_accounts_including_staff_start_without_two_factor(self):
        self.assertFalse(self.user.userprofile.two_factor_enabled)
        for staff in (False, True):
            with self.subTest(staff=staff):
                self.user.is_staff = staff
                self.user.is_superuser = staff
                self.user.set_password('Valid-Password123!')
                self.user.save()
                self.client.logout()
                response = self.client.post('/api/auth/login/', {
                    'username': self.user.username, 'password': 'Valid-Password123!',
                }, content_type='application/json')
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json().get('redirect_url'), '/')
                status = self.client.get('/api/auth/status/').json()
                self.assertTrue(status['authenticated'])
                self.assertFalse(status['user']['mfa_enabled'])
                self.assertIsNone(status.get('verification_url'))
                if staff:
                    self.assertEqual(self.client.get('/admin/').status_code, 200)

    def test_password_signup_verifies_email_without_enrolling_two_factor(self):
        client = Client()
        response = client.post('/api/auth/register/', {
            'username': 'optional-mfa', 'email': 'optional-mfa@example.test',
            'first_name': 'Test', 'last_name': 'Observer',
            'password1': 'Valid-Password123!', 'password2': 'Valid-Password123!',
        }, content_type='application/json')
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(username='optional-mfa')
        self.assertFalse(user.userprofile.two_factor_enabled)
        self.assertFalse(Authenticator.objects.filter(user=user).exists())
        self.assertFalse(client.get('/api/auth/status/').json()['authenticated'])
        confirmation = EmailConfirmation.objects.get(email_address__user=user)
        verified = client.get(f'/accounts/confirm-email/{confirmation.key}/')
        self.assertEqual(verified.status_code, 302)
        self.assertNotIn('/2fa/', verified.url)
        response = client.post('/api/auth/login/', {
            'username': user.email, 'password': 'Valid-Password123!',
        }, content_type='application/json')
        self.assertEqual(response.json()['redirect_url'], '/')
        status = client.get('/api/auth/status/').json()
        self.assertTrue(status['authenticated'])
        self.assertFalse(status['user']['mfa_enabled'])

    def test_saved_methods_do_not_override_disabled_two_factor_for_password_or_staff(self):
        TOTP.activate(self.user, generate_totp_secret())
        RecoveryCodes.activate(self.user)
        self.user.set_password('Valid-Password123!')
        for staff in (False, True):
            with self.subTest(staff=staff):
                self.user.is_staff = self.user.is_superuser = staff
                self.user.save()
                self.assertFalse(self.user.userprofile.two_factor_enabled)
                self.client.logout()
                response = self.client.post('/api/auth/login/', {
                    'username': self.user.username, 'password': 'Valid-Password123!',
                }, content_type='application/json')
                self.assertEqual(response.json()['redirect_url'], '/')
                status = self.client.get('/api/auth/status/').json()
                self.assertTrue(status['authenticated'])
                self.assertFalse(status['user']['mfa_enabled'])
                self.assertIsNone(status['verification_url'])

    def test_abandoned_setup_does_not_add_a_login_challenge(self):
        self.confirm_email()
        self.assertEqual(self.change('begin_totp').status_code, 200)
        self.user.set_password('Valid-Password123!')
        self.user.save()
        self.client.logout()
        response = self.client.post('/api/auth/login/', {
            'username': self.user.username, 'password': 'Valid-Password123!',
        }, content_type='application/json')
        self.assertEqual(response.json()['redirect_url'], '/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['user']['mfa_enabled'])

    def test_removing_saved_app_does_not_enable_disabled_two_factor(self):
        TOTP.activate(self.user, generate_totp_secret())
        self.confirm_email()
        response = self.change('remove_totp')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.userprofile.two_factor_enabled)
        self.assertFalse(Authenticator.objects.filter(user=self.user, type='totp').exists())

    def prepare_email_destination(self):
        account = SocialAccount.objects.create(user=self.user, provider='google', uid='email-choice',
                                              extra_data={'email': 'codes@example.test'})
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time(), 'method': 'mfa', 'mfa': True}
        session.save()
        return account

    def destination_code(self):
        response = self.change('send_email_destination_code', email='codes@example.test')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(mail.outbox[-1].to, ['codes@example.test'])
        return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()

    def test_email_destination_requires_mailbox_proof_and_preserves_primary_identity(self):
        account = self.prepare_email_destination()
        other = Client()
        other.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        code = self.destination_code()
        self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_email, '')
        self.assertEqual(self.change('set_email_destination', email='codes@example.test', code='wrong').status_code, 400)
        self.assertEqual(AccountVerification.objects.get(user=self.user).attempts, 1)
        response = self.change('set_email_destination', email='codes@example.test', code=code)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['email'], 'codes@example.test')
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'security@example.test')
        self.assertEqual(EmailAddress.objects.filter(user=self.user).count(), 1)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertFalse(other.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=code).status_code, 400)
        # Disconnecting/updating provider metadata cannot silently retarget a verified factor.
        account.delete()
        self.assertEqual(self.client.get('/api/auth/security/methods/').json()['email'], 'codes@example.test')
        AccountVerification.objects.filter(user=self.user).update(created_at=timezone.now() - timedelta(seconds=61))
        self.assertEqual(self.client.post('/api/auth/security/code/').status_code, 200)
        self.assertEqual(mail.outbox[-1].to, ['codes@example.test'])
        confirmation_code = re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'email_code', 'code': confirmation_code}).status_code, 200)
        self.start_login()
        AccountVerification.objects.filter(user=self.user).update(created_at=timezone.now() - timedelta(seconds=61))
        self.login_email_code()
        self.assertEqual(mail.outbox[-1].to, ['codes@example.test'])
        self.assertContains(self.client.get('/accounts/2fa/authenticate/'), 'c***@example.test')

    def test_email_destination_rejects_unlinked_removed_unavailable_and_cross_user_addresses(self):
        account = self.prepare_email_destination()
        self.assertEqual(self.change('send_email_destination_code', email='attacker@example.test').status_code, 400)
        code = self.destination_code()
        # A code intended to enroll a mailbox is not a sign-in or reauthentication code.
        self.assertEqual(self.client.post('/api/auth/security/', {'method': 'email_code', 'code': code}).status_code, 400)
        other = User.objects.create_user(username='other-choice', email='other-choice@example.test')
        EmailAddress.objects.create(user=other, email=other.email, primary=True, verified=True)
        UserProfile.objects.filter(user=other).update(two_factor_enabled=True)
        client = Client()
        client.force_login(other, backend='django.contrib.auth.backends.ModelBackend')
        session = client.session
        session['starview_recent_auth'] = {'user_id': other.pk, 'at': time.time(), 'method': 'mfa', 'mfa': True}
        session.save()
        self.assertEqual(client.post('/api/auth/security/methods/', {
            'action': 'set_email_destination', 'email': 'codes@example.test', 'code': code,
        }).status_code, 400)
        account.delete()
        self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=code).status_code, 400)
        self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_email, '')

    def test_destination_challenge_expires_and_is_bound_to_session_and_security_version(self):
        self.prepare_email_destination()
        code = self.destination_code()
        challenge = AccountVerification.objects.get(user=self.user)
        for field, value in (('session_digest', '0' * 64), ('expires_at', timezone.now() - timedelta(seconds=1))):
            original = getattr(challenge, field)
            AccountVerification.objects.filter(pk=challenge.pk).update(**{field: value})
            self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=code).status_code, 400)
            AccountVerification.objects.filter(pk=challenge.pk).update(**{field: original})
        UserProfile.objects.filter(user=self.user).update(security_version=1)
        session = self.client.session
        session['identity_version'] = 1
        session.save()
        self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=code).status_code, 400)

    def test_destination_wrong_attempts_are_committed_and_delivery_is_limited(self):
        self.prepare_email_destination()
        code = self.destination_code()
        wrong = '000000' if code != '000000' else '111111'
        self.assertEqual(self.change('send_email_destination_code', email='codes@example.test').status_code, 429)
        for _ in range(5):
            self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=wrong).status_code, 400)
        challenge = AccountVerification.objects.get(user=self.user)
        self.assertEqual(challenge.attempts, 5)
        self.assertIsNotNone(challenge.used_at)
        self.assertEqual(self.change('set_email_destination', email='codes@example.test', code=code).status_code, 400)

    def test_email_destination_is_protected_and_disabled_mfa_resets_it(self):
        self.prepare_email_destination()
        session = self.client.session
        session.pop('starview_recent_auth')
        session.save()
        self.assertEqual(self.change('send_email_destination_code', email='codes@example.test').status_code, 403)
        self.assertEqual(len(mail.outbox), 0)
        self.prepare_recent_for_email_test()
        UserProfile.objects.filter(user=self.user).update(two_factor_email='codes@example.test')
        self.assertEqual(self.change('disable').status_code, 200)
        self.assertEqual(UserProfile.objects.get(user=self.user).two_factor_email, '')
        self.assertEqual(self.change('send_email_destination_code', email='codes@example.test').status_code, 400)

    def prepare_recent_for_email_test(self):
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time(), 'method': 'mfa', 'mfa': True}
        session.save()
