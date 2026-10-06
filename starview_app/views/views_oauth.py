"""Public provider availability and CSRF-protected OAuth login initiation."""
from django.conf import settings
import json
import jwt
from django.http import HttpResponseRedirect, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from starview_app.utils.adapters import get_frontend_url


def _complete_callback(request, callback):
    from django.db import transaction
    # Includes provider-subject lookup, credential persistence, and allauth's
    # login/MFA stage. No second callback can race a partial identity creation.
    with transaction.atomic():
        return callback(request)


def google_callback(request):
    from allauth.socialaccount.providers.google.views import oauth2_callback
    return _complete_callback(request, oauth2_callback)


def apple_finish_callback(request):
    from allauth.socialaccount.providers.apple.views import oauth2_finish_login
    return _complete_callback(request, oauth2_finish_login)


@never_cache
@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def auth_providers(request):
    return Response({
        'apple': settings.APPLE_OAUTH_ENABLED,
        'csrf_token': get_token(request),
    })


@require_POST
@csrf_protect
def google_login(request):
    if request.POST.get('process') == 'connect':
        from starview_app.services.account_security import is_recent
        if not is_recent(request):
            return HttpResponseRedirect(get_frontend_url('/profile', {'error': 'reauthentication_required'}))
    from allauth.socialaccount.providers.google.views import oauth2_login
    return oauth2_login(request)


@require_POST
@csrf_protect
def apple_login(request):
    if request.POST.get('process') == 'connect':
        from starview_app.services.account_security import is_recent
        if not is_recent(request):
            return HttpResponseRedirect(get_frontend_url('/profile', {'error': 'reauthentication_required'}))
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


@csrf_exempt
@require_POST
def apple_notifications(request):
    from starview_app.services.apple_oauth import verify_apple_notification, process_apple_notification
    if not settings.APPLE_OAUTH_ENABLED:
        return JsonResponse({'detail': 'Apple sign-in is unavailable.'}, status=503)
    try:
        if len(request.body) > 20000:
            raise ValueError('Payload too large')
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError('Invalid body')
        event = verify_apple_notification(data.get('payload'))
    except jwt.PyJWKClientConnectionError:
        # Ask Apple to retry a temporary key-fetch failure.
        return JsonResponse({'detail': 'Verification is temporarily unavailable.'}, status=503)
    except (ValueError, TypeError, KeyError, jwt.PyJWTError):
        return JsonResponse({'detail': 'Invalid Apple notification.'}, status=400)
    process_apple_notification(event, request)
    return JsonResponse({'status': 'ok'})
