"""Keep allauth's pending-login/session lifecycle for every second-factor method."""

import secrets

from allauth.mfa.stages import AuthenticateStage
from starview_app.services.mfa_policy import requires_second_factor


class VerificationStage(AuthenticateStage):
    def _should_handle(self, request):
        return self.login.user is not None and requires_second_factor(self.login.user)

    def handle(self):
        response, cont = super().handle()
        if response:
            self.state.setdefault('challenge_nonce', secrets.token_urlsafe(24))
            self.state.setdefault('security_version', self.login.user.userprofile.security_version)
        return response, cont
