from types import SimpleNamespace
from unittest.mock import Mock

from django.http import HttpResponse
from django.contrib.auth.models import User
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.urls import path
from rest_framework.test import APIRequestFactory

from starview_app.utils.middleware import BrowserLanguageMiddleware
from starview_app.views.views_geoip import geolocate_ip
from starview_app.views.views_user import UserProfileViewSet


urlpatterns = [path('language/', lambda request: HttpResponse(request.LANGUAGE_CODE))]


class LocationLanguageTests(SimpleTestCase):
    @override_settings(DEBUG=True)
    def test_localhost_does_not_invent_a_location(self):
        response = geolocate_ip(APIRequestFactory().get('/api/geolocate/'))
        self.assertIsNone(response.data['latitude'])
        self.assertEqual(response.data['source'], 'unavailable')
        self.assertIn('no-store', response['Cache-Control'])

    def test_valid_zero_coordinates_and_invalid_coordinates(self):
        for lat, lng, valid in [('0', '0', True), ('-12', '-77', True),
                                ('nan', '0', False), ('0', 'inf', False),
                                ('91', '0', False), ('0', '-181', False)]:
            response = geolocate_ip(APIRequestFactory().get(
                '/api/geolocate/', HTTP_CF_IPLATITUDE=lat, HTTP_CF_IPLONGITUDE=lng))
            self.assertEqual(response.data['source'], 'ip' if valid else 'unavailable')

    def language_request(self, **headers):
        request = RequestFactory().post('/', **headers)
        request.session = {}
        return request

    def test_region_does_not_override_browser_and_detection_is_not_persisted(self):
        request = self.language_request(HTTP_ACCEPT_LANGUAGE='es;q=0.2,en;q=0.9', HTTP_CF_IPCOUNTRY='PE')
        BrowserLanguageMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.LANGUAGE_CODE, 'en')
        self.assertEqual(request.session, {})

    def test_explicit_cookie_overrides_legacy_detection_cache(self):
        request = self.language_request(HTTP_ACCEPT_LANGUAGE='es-PE,es;q=0.9')
        request.COOKIES['django_language'] = 'en'
        request.session['django_language'] = 'es'
        BrowserLanguageMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.LANGUAGE_CODE, 'en')

    def test_legacy_session_detection_does_not_override_browser(self):
        request = self.language_request(HTTP_ACCEPT_LANGUAGE='en')
        request.session['django_language'] = 'es'
        BrowserLanguageMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.LANGUAGE_CODE, 'en')

    def test_profile_language_takes_precedence(self):
        request = self.language_request(HTTP_ACCEPT_LANGUAGE='es')
        request.COOKIES['django_language'] = 'es'
        request.user = SimpleNamespace(is_authenticated=True, userprofile=SimpleNamespace(language_preference='en'))
        BrowserLanguageMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.LANGUAGE_CODE, 'en')

    def test_regional_language_choices_round_trip(self):
        for requested, canonical in [('pt-br', 'pt-BR'), ('zh-CN', 'zh-CN'), ('EN', 'en')]:
            profile = Mock()
            request = SimpleNamespace(data={'language_preference': requested},
                                      user=SimpleNamespace(userprofile=profile), session={})
            response = UserProfileViewSet().update_language_preference(request)
            self.assertEqual(response.data['language_preference'], canonical)
            self.assertEqual(profile.language_preference, canonical)
            profile.save.assert_called_once()


@override_settings(ROOT_URLCONF=__name__)
class AuthenticatedLanguageTests(TestCase):
    def test_saved_profile_language_is_available_in_real_middleware_stack(self):
        user = User.objects.create_user(username='language-test')
        user.userprofile.language_preference = 'pt-BR'
        user.userprofile.save(update_fields=['language_preference'])
        self.client.force_login(user)
        self.client.cookies['django_language'] = 'es'
        response = self.client.get('/language/', HTTP_ACCEPT_LANGUAGE='en')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'pt-BR')
