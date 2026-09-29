"""Public provider availability and CSRF-protected Apple login initiation."""
from django.conf import settings
from django.http import HttpResponseRedirect
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from starview_app.utils.adapters import get_frontend_url


@never_cache
@api_view(['GET'])
@permission_classes([AllowAny])
def auth_providers(request):
    return Response({
        'apple': settings.APPLE_OAUTH_ENABLED,
        'csrf_token': get_token(request),
    })


@require_POST
@csrf_protect
def apple_login(request):
    if not settings.APPLE_OAUTH_ENABLED:
        return HttpResponseRedirect(get_frontend_url('/login', {'error': 'oauth_unavailable'}))
    from allauth.socialaccount.providers.apple.views import oauth2_login
    return oauth2_login(request)


def apple_callback(request):
    # allauth's temporary callback cookie never needs to be accessible to JavaScript.
    from allauth.socialaccount.providers.apple.views import apple_post_callback
    response = apple_post_callback(request)
    if 'apple-login-session' in response.cookies:
        response.cookies['apple-login-session']['httponly'] = True
    return response
