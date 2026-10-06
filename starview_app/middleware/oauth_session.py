"""Enforce account session versions/provider ownership and private cache headers."""

from django.contrib.auth import logout
from django.utils.cache import add_never_cache_headers, patch_vary_headers
from allauth.socialaccount.models import SocialAccount


class OAuthSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated and (
            request.session.get('identity_version', 0) != request.user.userprofile.security_version
        ):
            logout(request)
        account_id = request.session.get('oauth_account_id')
        if request.user.is_authenticated:
            if account_id is not None:
                if not SocialAccount.objects.filter(pk=account_id, user_id=request.user.pk).exists():
                    logout(request)
            else:
                # Sessions created before this middleware still contain allauth's
                # authentication history. Never infer identity from an email/device.
                methods = request.session.get('account_authentication_methods', [])
                method = next((item for item in reversed(methods) if item.get('method') != 'mfa'), {})
                if method.get('method') == 'socialaccount':
                    account = SocialAccount.objects.filter(
                        user_id=request.user.pk, provider=method.get('provider'), uid=method.get('uid'),
                    ).first()
                    if account is None or account.date_joined.timestamp() > method.get('at', 0):
                        logout(request)
                    else:
                        request.session['oauth_account_id'] = account.pk
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            patch_vary_headers(response, ('Cookie',))
        if request.path.startswith(('/api/auth/', '/api/users/me/', '/accounts/')) or (
            request.path.startswith('/api/') and request.user.is_authenticated
        ):
            add_never_cache_headers(response)
        return response
