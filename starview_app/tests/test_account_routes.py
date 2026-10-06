"""The URL surface exposes only account flows supported by the application."""

from django.contrib.auth.models import AnonymousUser, User
from django.test import SimpleTestCase
from django.urls import Resolver404, resolve, reverse

from starview_app.utils.adapters import CustomAccountAdapter


class AccountRouteTests(SimpleTestCase):
    def test_retired_management_and_unused_provider_routes_do_not_resolve(self):
        for suffix in (
            '2fa/', '2fa/reauthenticate/', '2fa/totp/activate/',
            '2fa/totp/deactivate/', '2fa/recovery-codes/',
            '2fa/recovery-codes/generate/', '2fa/recovery-codes/download/',
            'email/', 'password/change/', 'password/set/',
            'password/reset/key/user-old-token/', '3rdparty/',
            'social/connections/', 'google/login/token/', 'login/code/confirm/',
        ):
            with self.subTest(suffix=suffix), self.assertRaises(Resolver404):
                resolve('/accounts/' + suffix)

    def test_provider_and_pending_login_names_resolve_to_supported_controllers(self):
        for name in ('google_login', 'google_callback', 'apple_login',
                     'apple_callback', 'apple_finish_callback', 'mfa_authenticate',
                     'account_reauthenticate', 'account_confirm_email'):
            kwargs = {'key': 'fixture-key'} if name == 'account_confirm_email' else None
            match = resolve(reverse(name, kwargs=kwargs))
            self.assertEqual(match.url_name, name)
            self.assertTrue(match.func.__module__.startswith('starview_app.'))

    def test_allauth_reauthentication_uses_the_single_supported_controller(self):
        adapter = CustomAccountAdapter()
        self.assertEqual(adapter.get_reauthentication_methods(AnonymousUser()), [])
        methods = adapter.get_reauthentication_methods(User(username='fixture'))
        self.assertEqual([method['url'] for method in methods], ['/accounts/reauthenticate/'])
