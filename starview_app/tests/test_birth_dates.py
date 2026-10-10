"""Private birth-date storage, input bounds, and non-blocking onboarding."""
from datetime import date, timedelta
from unittest.mock import patch

from allauth.account.models import EmailAddress, EmailConfirmation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import Client, TestCase
from django.utils import timezone

from starview_app.models import UserProfile
from starview_app.services.birth_dates import BIRTH_DATE_PROMPT_KEY, validate_birth_date


class BirthDateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='birthday-owner', email='birthday@example.test')
        self.other = User.objects.create_user(username='birthday-other', email='other-birthday@example.test')
        for user in (self.owner, self.other):
            EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        self.client.force_login(self.owner, backend='django.contrib.auth.backends.ModelBackend')

    def save_date(self, value):
        return self.client.patch('/api/users/me/update-birth-date/', {'birth_date': value}, content_type='application/json')

    def set_prompt(self, user_id=None):
        session = self.client.session
        session[BIRTH_DATE_PROMPT_KEY] = self.owner.pk if user_id is None else user_id
        session.save()

    def test_existing_accounts_have_no_date_and_no_prompt(self):
        data = self.client.get('/api/auth/status/').json()['user']
        self.assertIsNone(data['birth_date'])
        self.assertFalse(data['birth_date_prompt'])

    def test_update_is_private_and_survives_an_auth_refresh(self):
        response = self.save_date('2000-02-29')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['birth_date'], '2000-02-29')
        for endpoint in ('/api/users/me/', '/api/auth/status/'):
            result = self.client.get(endpoint)
            data = result.json()
            self.assertEqual(data.get('user', data)['birth_date'], '2000-02-29')
            self.assertIn('no-store', result['Cache-Control'])
        for client in (self.client, Client()):
            public = client.get(f'/api/users/{self.owner.username}/')
            self.assertEqual(public.status_code, 200)
            self.assertNotIn('birth_date', public.json())
            self.assertNotIn('birth_date_prompt', public.json())
            self.assertNotContains(public, '2000-02-29')

    def test_other_user_cannot_target_the_owner(self):
        self.save_date('2000-02-29')
        self.client.force_login(self.other, backend='django.contrib.auth.backends.ModelBackend')
        self.assertIsNone(self.client.get('/api/users/me/').json()['birth_date'])
        response = self.client.patch('/api/users/me/update-birth-date/', {
            'user_id': self.owner.pk, 'birth_date': '1998-01-01',
        }, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(UserProfile.objects.get(user=self.owner).birth_date, date(2000, 2, 29))
        self.assertEqual(UserProfile.objects.get(user=self.other).birth_date, date(1998, 1, 1))
        self.assertEqual(self.client.patch(f'/api/users/{self.owner.username}/', {
            'birth_date': '1999-01-01',
        }, content_type='application/json').status_code, 405)

    def test_anonymous_and_unverified_users_cannot_read_or_change_private_dates(self):
        self.client.logout()
        for path, method in (('/api/users/me/', 'get'),
                             ('/api/users/me/update-birth-date/', 'patch'),
                             ('/api/users/me/dismiss-birth-date-prompt/', 'post')):
            self.assertIn(getattr(self.client, method)(path).status_code, (401, 403))
        EmailAddress.objects.filter(user=self.owner).update(verified=False)
        self.client.force_login(self.owner, backend='django.contrib.auth.backends.ModelBackend')
        self.assertIn(self.save_date('2000-01-01').status_code, (401, 403))

    def test_calendar_and_type_errors_preserve_saved_date(self):
        self.save_date('2000-02-29')
        invalid = ('2023-02-29', '2000-04-31', '2000-13-01', '2000-01-00', '1899-12-31',
                   '2000-2-9', '2000-01-01T00:00:00Z', '', 2000, True, [], {},
                   (timezone.localdate() + timedelta(days=1)).isoformat())
        for value in invalid:
            with self.subTest(value=value):
                response = self.save_date(value)
                self.assertEqual(response.status_code, 400)
                self.assertIn('birth_date', response.json()['errors'])
                self.assertEqual(UserProfile.objects.get(user=self.owner).birth_date, date(2000, 2, 29))
        for value in ({}, [], None):
            response = self.client.patch('/api/users/me/update-birth-date/', value, content_type='application/json')
            self.assertEqual(response.status_code, 400)

    def test_model_validation_uses_same_bounds(self):
        with self.assertRaises(ValidationError):
            validate_birth_date(date(1899, 12, 31))
        with self.assertRaises(ValidationError):
            validate_birth_date(timezone.localdate() + timedelta(days=1))
        validate_birth_date(date(1900, 1, 1))
        validate_birth_date(timezone.localdate())

    def test_no_minimum_age_or_restriction_is_applied(self):
        young_date = (timezone.localdate() - timedelta(days=365 * 10)).isoformat()
        self.assertEqual(self.save_date(young_date).status_code, 200)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertEqual(self.client.get('/api/users/me/').status_code, 200)
        self.assertEqual(self.save_date(timezone.localdate().isoformat()).status_code, 200)

    def test_null_removes_date_without_closing_account(self):
        self.save_date('2000-02-29')
        self.assertEqual(self.save_date(None).status_code, 200)
        self.assertIsNone(UserProfile.objects.get(user=self.owner).birth_date)
        self.assertTrue(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_optional_prompt_is_identity_bound_and_dismissible(self):
        self.set_prompt(self.other.pk)
        self.assertFalse(self.client.get('/api/auth/status/').json()['user']['birth_date_prompt'])
        self.set_prompt()
        self.assertTrue(self.client.get('/api/auth/status/').json()['user']['birth_date_prompt'])
        self.assertEqual(self.client.post('/api/users/me/dismiss-birth-date-prompt/').status_code, 200)
        self.assertFalse(self.client.get('/api/auth/status/').json()['user']['birth_date_prompt'])
        self.assertIsNone(UserProfile.objects.get(user=self.owner).birth_date)

    def test_saving_date_clears_prompt(self):
        self.set_prompt()
        self.assertEqual(self.save_date('2000-01-01').status_code, 200)
        self.assertNotIn(BIRTH_DATE_PROMPT_KEY, self.client.session)

    def test_registration_accepts_private_date_or_omission_without_age_gate(self):
        self.client.logout()
        for i, extra in enumerate(({}, {'birth_date': None}, {'birth_date': '2000-02-29'},
                                   {'birth_date': timezone.localdate().isoformat()})):
            with self.subTest(extra=extra), patch.object(EmailConfirmation, 'send'):
                email = f'new-birthday-{i}@example.test'
                response = self.client.post('/api/auth/register/', {
                    'email': email, 'first_name': 'Test', 'last_name': 'Observer',
                    'password1': 'Account-Test123!', 'password2': 'Account-Test123!', **extra,
                }, content_type='application/json')
                self.assertEqual(response.status_code, 201)
                saved = UserProfile.objects.get(user__email=email).birth_date
                self.assertEqual(saved.isoformat() if saved else None, extra.get('birth_date'))
                self.assertNotIn('birth_date', response.json())

    def test_invalid_registration_date_does_not_create_account_or_send_email(self):
        with patch.object(EmailConfirmation, 'send') as send:
            response = self.client.post('/api/auth/register/', {
                'email': 'invalid-birthday@example.test', 'first_name': 'Test', 'last_name': 'Observer',
                'password1': 'Account-Test123!', 'password2': 'Account-Test123!', 'birth_date': '2023-02-29',
            }, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='invalid-birthday@example.test').exists())
        send.assert_not_called()

    def test_date_mutations_retain_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.owner, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(client.patch('/api/users/me/update-birth-date/', {
            'birth_date': '2000-01-01',
        }, content_type='application/json').status_code, 403)
        self.assertEqual(client.post('/api/users/me/dismiss-birth-date-prompt/').status_code, 403)
