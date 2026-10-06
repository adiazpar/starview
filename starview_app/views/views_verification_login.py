"""Second-factor sign-in, using the same methods as account confirmation."""

from django.template.response import TemplateResponse
from django.contrib.messages import get_messages
from django.contrib.auth import get_user_model
from django.db import transaction
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from allauth.account.internal.decorators import login_stage_required
from allauth.mfa.stages import AuthenticateStage
from allauth.socialaccount.models import SocialAccount
from rest_framework.exceptions import APIException

from starview_app.services.verification_methods import send_code, verify_code
from starview_app.services.email_identity import verified_primary
from starview_app.views.views_reauthentication import verification_context, describe_error


@login_stage_required(stage=AuthenticateStage.key, redirect_urlname='account_login')
@csrf_protect
@require_http_methods(['GET', 'POST'])
def verify_login(request):
    # Do not show a previous account's sign-in toast above this pending login.
    list(get_messages(request))
    stage = request._login_stage
    if request.GET.get('cancel') == '1':
        request.session.pop('account_login_verification_id', None)
        return stage.abort()
    # Hold the same account lock as credential changes through session creation;
    # an app/recovery code must not revive a revoked pending sign-in.
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().filter(pk=getattr(stage.login.user, 'pk', None)).first()
        if (user is None or not user.is_active or not verified_primary(user)
                or stage.state.get('security_version') != user.userprofile.security_version
                or not stage.state.get('challenge_nonce')):
            return stage.abort()
        sociallogin = (stage.login.signal_kwargs or {}).get('sociallogin')
        if sociallogin is not None:
            account = sociallogin.account
            if not SocialAccount.objects.filter(
                pk=account.pk, user=user, provider=account.provider, uid=account.uid,
            ).exists():
                return stage.abort()
            sociallogin.user = user
        stage.login.user = user
        context = verification_context(request, user)
        context.update(signing_in=True, cancel_url='/accounts/2fa/authenticate/?cancel=1', messages=[])
        purpose = 'login:' + stage.state['challenge_nonce']
        if request.method == 'POST':
            try:
                if request.POST.get('action') == 'send_code':
                    send_code(request, user, context['method'], purpose=purpose)
                    context['sent'] = True
                else:
                    verify_code(request, user, context['method'], request.POST.get('code', ''),
                                purpose=purpose, reauthenticated=False)
                    return stage.exit()
            except APIException as exc:
                # Catch inside the transaction so failed-code counters commit.
                context['error'] = describe_error(exc)
    return TemplateResponse(request, 'account/security_confirm.html', context)
