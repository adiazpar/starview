from django.test import RequestFactory, SimpleTestCase, override_settings

from starview_app.utils.adapters import get_frontend_redirect_url


class FrontendRedirectTests(SimpleTestCase):
    @override_settings(DEBUG=True)
    def test_development_paths_and_same_host_absolute_urls_return_to_vite(self):
        request = RequestFactory().get('/', HTTP_HOST='localhost:8000')
        for destination in ('/profile?social_connected=true#settings',
                            'http://localhost:8000/profile?social_connected=true#settings',
                            'http://localhost:5173/profile?social_connected=true#settings'):
            with self.subTest(destination=destination):
                self.assertEqual(get_frontend_redirect_url(request, destination),
                                 'http://localhost:5173/profile?social_connected=true#settings')

    def test_external_and_ambiguous_destinations_are_rejected(self):
        request = RequestFactory().get('/', secure=True, HTTP_HOST='starview.example')
        with override_settings(DEBUG=False, ALLOWED_HOSTS=['starview.example']):
            for destination in ('https://attacker.example', '//attacker.example', '/\\attacker.example',
                                'https://starview.example//attacker.example',
                                'https://starview.example/\\attacker.example',
                                'http://starview.example/profile', 'javascript:alert(1)'):
                with self.subTest(destination=destination):
                    self.assertEqual(get_frontend_redirect_url(request, destination), '/')

    @override_settings(DEBUG=False, ALLOWED_HOSTS=['starview.example'])
    def test_production_urls_stay_on_current_origin(self):
        request = RequestFactory().get('/', secure=True, HTTP_HOST='starview.example')
        self.assertEqual(get_frontend_redirect_url(request, 'https://starview.example/profile#settings'),
                         '/profile#settings')
        self.assertEqual(get_frontend_redirect_url(request, None, fallback='/profile'), '/profile')


class PendingOAuthCredentialTests(SimpleTestCase):
    def test_pending_token_survives_key_rotation_without_plaintext_storage(self):
        from allauth.socialaccount.models import SocialToken
        from starview_app.utils.adapters import CustomSocialAccountAdapter
        import json

        adapter = CustomSocialAccountAdapter()
        token = SocialToken(token='fixture-access-token', token_secret='fixture-refresh-token')
        with override_settings(SECRET_KEY='old-test-key', SECRET_KEY_FALLBACKS=[]):
            data = adapter.serialize_instance(token)
        self.assertFalse('fixture-access-token' in json.dumps(data))
        self.assertFalse('fixture-refresh-token' in json.dumps(data))
        with override_settings(SECRET_KEY='new-test-key', SECRET_KEY_FALLBACKS=['old-test-key']):
            restored = adapter.deserialize_instance(SocialToken, data)
        self.assertEqual(restored.token, token.token)
        self.assertEqual(restored.token_secret, token.token_secret)
        with self.assertRaises(ValueError):
            adapter.deserialize_instance(SocialToken, {'starview_oauth_token_v1': 'invalid'})
        with self.assertRaises(ValueError):
            adapter.deserialize_instance(SocialToken, {'token': token.token})
