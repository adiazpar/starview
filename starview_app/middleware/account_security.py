"""Protect staff access and allauth's secondary credential-management routes."""

from django.http import HttpResponseRedirect, JsonResponse
from django.core.exceptions import PermissionDenied
from django.utils.cache import add_never_cache_headers

from urllib.parse import urlencode

from starview_app.services.account_security import is_recent, staff_verification_url


class AccountSecurityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = request.user
        if user.is_authenticated:
            if request.path.startswith('/accounts/2fa/'):
                from starview_app.services.email_identity import verified_primary
                if not verified_primary(user):
                    raise PermissionDenied('Verify your primary email before managing two-factor authentication.')
            if user.is_staff:
                target = staff_verification_url(request)
                allowed = request.path.startswith((
                    '/accounts/2fa/', '/accounts/reauthenticate/', '/api/auth/',
                    '/accounts/logout/', '/accounts/confirm-email/', '/static/', '/media/', '/profile',
                    '/images/', '/assets/', '/locales/', '/favicon',
                ))
                if target and not allowed:
                    if request.path.startswith('/api/'):
                        response = JsonResponse({'code': 'staff_mfa_required', 'detail': 'Confirm your enabled two-factor authentication to continue.', 'verification_url': target}, status=403)
                    else:
                        response = HttpResponseRedirect(target)
                    add_never_cache_headers(response)
                    return response

                sensitive_admin = request.path.startswith((
                    '/admin/auth/', '/admin/account/', '/admin/socialaccount/', '/admin/mfa/',
                )) and (request.method == 'POST' or request.path.endswith(('/change/', '/delete/', '/password/', '/add/')))
                if sensitive_admin and not is_recent(request):
                    response = HttpResponseRedirect('/accounts/reauthenticate/?' + urlencode({'next': request.get_full_path()}))
                    add_never_cache_headers(response)
                    return response

            # MFA management is handled by the protected API and shared modal;
            # legacy management URLs only redirect there and expose no secrets.
        return self.get_response(request)
