"""The API uses the same verified browser session as the website."""

from django.contrib.auth import logout
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied


class VerifiedSessionAuthentication(SessionAuthentication):
    def authenticate_header(self, request):
        # Preserve a 401 for expired sessions without HTTP Basic's browser prompt.
        return 'Session'

    def authenticate(self, request):
        from starview_app.services.email_identity import verified_primary
        result = super().authenticate(request)
        if result is not None:
            user, _ = result
            if not verified_primary(user):
                # Expire legacy sessions admitted under the previous optional
                # verification policy, so public recovery flows remain usable.
                logout(request._request)
                raise PermissionDenied('Please verify your primary email address before continuing.')
        return result
