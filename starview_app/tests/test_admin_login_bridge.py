"""Admin enters the same password/OAuth/MFA flow as the rest of the application."""

from urllib.parse import parse_qs, urlsplit

from allauth.account.models import EmailAddress
from django.contrib.auth.models import User
from django.core.cache import caches
from django.test import Client, TestCase, override_settings

from starview_app.models import UserProfile


@override_settings(DEBUG=False)
class AdminLoginBridgeTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.staff = User.objects.create_user(username='bridge-staff', email='staff@example.test',
                                               password='Current-Password123!', is_staff=True)
        EmailAddress.objects.create(user=self.staff, email=self.staff.email, primary=True, verified=True)

    def assert_login_destination(self, response, next_path):
        self.assertEqual(response.status_code, 302)
        target = urlsplit(response.url)
        self.assertEqual(target.path, '/login')
        self.assertEqual(parse_qs(target.query), {'next': [next_path]})
        self.assertIn('no-store', response['Cache-Control'])

    def test_anonymous_admin_visit_preserves_return_destination(self):
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 302)
        self.assert_login_destination(self.client.get(response.url), '/admin/')

    def test_safe_admin_destination_survives_password_sign_in(self):
        next_path = '/admin/auth/user/?q=observer'
        self.assert_login_destination(self.client.get('/admin/login/', {'next': next_path}), next_path)
        response = self.client.post('/api/auth/login/', {
            'username': self.staff.username, 'password': 'Current-Password123!', 'next': next_path,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['redirect_url'], next_path)
        self.assertTrue(self.client.get('/admin/').wsgi_request.user.is_authenticated)

    def test_admin_password_post_cannot_switch_to_mfa_account(self):
        target = User.objects.create_user(username='bridge-target', email='target@example.test',
                                          password='Target-Password123!', is_staff=True, is_superuser=True)
        EmailAddress.objects.create(user=target, email=target.email, primary=True, verified=True)
        UserProfile.objects.filter(user=target).update(two_factor_enabled=True)
        self.client.force_login(self.staff, backend='django.contrib.auth.backends.ModelBackend')
        response = self.client.post('/admin/login/', {
            'username': target.username, 'password': 'Target-Password123!', 'next': '/admin/',
        })
        self.assertEqual(response.status_code, 405)
        self.assertEqual(self.client.get('/api/auth/status/').json()['user']['id'], self.staff.pk)
        self.client.logout()
        response = self.client.post('/api/auth/login/', {
            'username': target.username, 'password': 'Target-Password123!', 'next': '/admin/',
        })
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_anonymous_admin_password_post_is_not_a_second_login_path(self):
        response = self.client.post('/admin/login/', {
            'username': self.staff.username, 'password': 'Current-Password123!',
        })
        self.assertEqual(response.status_code, 405)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_authenticated_staff_go_to_dashboard_and_nonstaff_are_forbidden(self):
        self.client.force_login(self.staff, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(self.client.get('/admin/login/').url, '/admin/')
        ordinary = User.objects.create_user(username='bridge-ordinary', email='ordinary@example.test')
        EmailAddress.objects.create(user=ordinary, email=ordinary.email, primary=True, verified=True)
        self.client.force_login(ordinary, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(self.client.get('/admin/login/').status_code, 403)

    def test_external_admin_return_destination_is_rejected(self):
        for destination in ('https://untrusted.example/', '//untrusted.example/', '/\\untrusted.example/'):
            with self.subTest(destination=destination):
                self.assert_login_destination(self.client.get('/admin/login/', {'next': destination}), '/admin/')

    def test_legacy_login_redirect_preserves_safe_next(self):
        self.assert_login_destination(self.client.get('/accounts/login/', {'next': '/profile?security=1'}), '/profile?security=1')
        self.assert_login_destination(self.client.get('/accounts/login/', {'next': 'https://untrusted.example/'}), '/')

    @override_settings(DEBUG=True, INTERNAL_IPS=[])
    def test_development_login_keeps_next_relative_for_password_flow(self):
        client = Client(HTTP_HOST='localhost:8000')
        response = client.get('/admin/login/', {'next': 'http://localhost:8000/admin/'})
        self.assert_login_destination(response, '/admin/')
        self.assertEqual(urlsplit(response.url).netloc, 'localhost:5173')
        self.assert_login_destination(client.get('/accounts/login/', {'next': '/admin/'}), '/admin/')
