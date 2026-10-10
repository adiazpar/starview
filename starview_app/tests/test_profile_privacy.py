"""Owner-only privacy preference storage, before visibility enforcement exists."""
from allauth.account.models import EmailAddress
from django.contrib.auth.models import User
from django.test import Client, TestCase

from starview_app.models import UserProfile


class ProfilePrivacyTests(TestCase):
    endpoint = '/api/users/me/update-privacy/'

    def setUp(self):
        self.owner = User.objects.create_user(username='privacy-owner', email='privacy-owner@example.test')
        self.other = User.objects.create_user(username='privacy-other', email='privacy-other@example.test')
        for user in (self.owner, self.other):
            EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        self.client.force_login(self.owner, backend='django.contrib.auth.backends.ModelBackend')

    def save(self, data):
        return self.client.patch(self.endpoint, data, content_type='application/json')

    def test_defaults_public_and_saves_both_values_across_auth_refresh(self):
        self.assertFalse(UserProfile.objects.get(user=self.owner).is_private)
        for value in (True, False):
            response = self.save({'is_private': value})
            self.assertEqual(response.status_code, 200)
            self.assertIs(response.json()['is_private'], value)
            self.assertIs(UserProfile.objects.get(user=self.owner).is_private, value)
            for endpoint in ('/api/users/me/', '/api/auth/status/'):
                result = self.client.get(endpoint)
                data = result.json()
                self.assertIs(data.get('user', data)['is_private'], value)
                self.assertIn('no-store', result['Cache-Control'])

    def test_invalid_payloads_do_not_change_saved_preference(self):
        self.save({'is_private': True})
        payloads = [{}, [], None, 'private', {'is_private': None}]
        payloads += [{'is_private': value} for value in ('true', 'false', 0, 1, [], {}, 'private')]
        for payload in payloads:
            with self.subTest(payload=payload):
                self.assertEqual(self.save(payload).status_code, 400)
                self.assertTrue(UserProfile.objects.get(user=self.owner).is_private)

    def test_owner_is_derived_from_session_not_supplied_identifiers(self):
        response = self.save({'is_private': True, 'user_id': self.other.pk, 'username': self.other.username})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(UserProfile.objects.get(user=self.owner).is_private)
        self.assertFalse(UserProfile.objects.get(user=self.other).is_private)
        response = self.client.patch(f'/api/users/{self.other.username}/update-privacy/',
                                     {'is_private': True}, content_type='application/json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(UserProfile.objects.get(user=self.other).is_private)

    def test_requires_authentication_and_csrf(self):
        anonymous = Client()
        self.assertIn(anonymous.patch(self.endpoint, {'is_private': True},
                                     content_type='application/json').status_code, (401, 403))
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.owner, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(csrf_client.patch(self.endpoint, {'is_private': True},
                                          content_type='application/json').status_code, 403)
        self.assertFalse(UserProfile.objects.get(user=self.owner).is_private)

    def test_preference_does_not_yet_change_public_profile_or_expose_setting(self):
        self.save({'is_private': True})
        response = Client().get(f'/api/users/{self.owner.username}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['username'], self.owner.username)
        self.assertNotIn('is_private', response.json())

    def test_read_requests_cannot_change_the_preference(self):
        self.assertEqual(self.client.get(self.endpoint, {'is_private': True}).status_code, 405)
        self.assertFalse(UserProfile.objects.get(user=self.owner).is_private)
