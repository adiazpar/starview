"""Malformed auth inputs fail before credential lookup or delivery side effects."""
from unittest.mock import patch

from allauth.account.models import EmailAddress, EmailConfirmation
from django.contrib.auth.models import User
from django.core.cache import caches
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from starview_app.views.views_auth import password_reset_token_generator


class AuthInputValidationTests(TestCase):
    password = '  Untrimmed-Password123!  '

    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(username='input-owner', email='input@example.test', password=self.password)
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = password_reset_token_generator.make_token(self.user)
        self.reset_url = f'/api/auth/password-reset-confirm/{uid}/{token}/'
        self.registration = {
            'email': 'new-input@example.test', 'first_name': 'Input', 'last_name': 'Observer',
            'password1': self.password, 'password2': self.password,
        }

    def post(self, path, data):
        return self.client.post(path, data, content_type='application/json')

    def assert_validation_error(self, response):
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error_code'], 'VALIDATION_ERROR')

    def test_non_object_json_is_rejected_by_all_auth_mutations(self):
        for path in ('/api/auth/register/', '/api/auth/login/', '/api/auth/resend-verification/',
                     '/api/auth/password-reset/', self.reset_url):
            for payload in ('[]', 'null', '123', '"text"'):
                with self.subTest(path=path, payload=payload):
                    self.assert_validation_error(self.post(path, payload))
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(EmailConfirmation.objects.exists())
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_registration_rejects_non_text_fields_and_database_length_overflow(self):
        for field in self.registration.keys() | {'username'}:
            for bad_value in (None, [], {}, 123, True):
                with self.subTest(field=field, value=bad_value):
                    self.assert_validation_error(self.post('/api/auth/register/', {**self.registration, field: bad_value}))
        for field in ('first_name', 'last_name', 'email'):
            maximum = User._meta.get_field(field).max_length
            self.assert_validation_error(self.post('/api/auth/register/', {**self.registration, field: 'a' * (maximum + 1)}))
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(EmailConfirmation.objects.exists())

    def test_registration_preserves_optional_username_required_names_and_password_whitespace(self):
        for field in ('first_name', 'last_name'):
            missing_name = {key: value for key, value in self.registration.items() if key != field}
            self.assert_validation_error(self.post('/api/auth/register/', missing_name))
        with patch.object(EmailConfirmation, 'send') as send:
            response = self.post('/api/auth/register/', self.registration)
        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email=self.registration['email'])
        self.assertTrue(created.username.startswith('user'))
        self.assertTrue(created.check_password(self.password))
        self.assertFalse(created.check_password(self.password.strip()))
        self.assertFalse(EmailAddress.objects.get(user=created, primary=True).verified)
        send.assert_called_once()
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_login_rejects_non_text_fields_before_authentication(self):
        valid = {'username': self.user.username, 'password': self.password, 'next': '/profile'}
        with patch('starview_app.views.views_auth.authenticate') as authenticate:
            for field in valid:
                for bad_value in (None, [], {}, 123, True):
                    with self.subTest(field=field, value=bad_value):
                        self.assert_validation_error(self.post('/api/auth/login/', {**valid, field: bad_value}))
            # Unknown accounts must not reach the dummy password hash with a malformed password.
            self.assert_validation_error(self.post('/api/auth/login/', {'username': 'unknown', 'password': ['bad']}))
        authenticate.assert_not_called()
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_remember_me_accepts_only_booleans_and_keeps_default_session_policy(self):
        valid = {'username': self.user.username, 'password': self.password}
        for value in (None, 'true', 'false', 0, 1, [], {}):
            with self.subTest(value=value):
                self.assert_validation_error(self.post('/api/auth/login/', {**valid, 'remember_me': value}))
                self.assertNotIn('_auth_user_id', self.client.session)
        for choice in ({}, {'remember_me': False}, {'remember_me': True}):
            with self.subTest(choice=choice):
                response = self.post('/api/auth/login/', {**valid, **choice})
                self.assertEqual(response.status_code, 200)
                remembered = choice.get('remember_me', False)
                self.assertEqual(self.client.session['remember_me'], remembered)
                self.assertEqual(self.client.session.get_expire_at_browser_close(), not remembered)
                self.client.logout()
        # A stripped credential differs from the actual password.
        self.assert_validation_error(self.post('/api/auth/login/', {**valid, 'password': self.password.strip()}))

    def test_recovery_rejects_non_text_email_and_language_before_delivery(self):
        with patch('starview_app.views.views_auth.enqueue_account_email') as enqueue, \
                patch('starview_app.services.email_identity.resend_primary_confirmation') as resend:
            for path in ('/api/auth/resend-verification/', '/api/auth/password-reset/'):
                for bad_value in (None, [], {}, 123, True):
                    with self.subTest(path=path, email=bad_value):
                        self.assert_validation_error(self.post(path, {'email': bad_value}))
                self.assert_validation_error(self.post(path, {'email': 'invalid-email'}))
            for email in (self.user.email, 'unknown@example.test'):
                for bad_value in (None, [], {}, 123, True):
                    with self.subTest(email=email, language=bad_value):
                        self.assert_validation_error(self.post('/api/auth/password-reset/', {'email': email, 'language': bad_value}))
        enqueue.assert_not_called()
        resend.assert_not_called()

    def test_valid_recovery_emails_retain_generic_responses_and_language_fallback(self):
        with patch('starview_app.services.email_identity.resend_primary_confirmation') as resend:
            known = self.post('/api/auth/resend-verification/', {'email': ' INPUT@example.test '})
            unknown = self.post('/api/auth/resend-verification/', {'email': 'unknown@example.test'})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(resend.call_args_list[0].args[1], self.user.email)
        with patch('starview_app.views.views_auth.enqueue_account_email') as enqueue:
            known = self.post('/api/auth/password-reset/', {'email': ' INPUT@example.test ', 'language': 'unsupported'})
            unknown = self.post('/api/auth/password-reset/', {'email': 'unknown@example.test', 'language': 'unsupported'})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.json(), unknown.json())
        enqueue.assert_called_once()

    def test_reset_confirmation_rejects_non_text_passwords_without_consuming_token(self):
        new_password = '  Another-Password456!  '
        valid = {'password1': new_password, 'password2': new_password}
        for field in valid:
            for bad_value in (None, [], {}, 123, True):
                with self.subTest(field=field, value=bad_value):
                    self.assert_validation_error(self.post(self.reset_url, {**valid, field: bad_value}))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.password))
        with patch('starview_app.services.account_events.record_account_event'), patch('axes.utils.reset'):
            response = self.post(self.reset_url, valid)
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))
        self.assertFalse(self.user.check_password(new_password.strip()))
