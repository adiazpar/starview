"""Second-factor sign-in, using the same methods as account confirmation."""

from django.template.response import TemplateResponse
from django.contrib.messages import get_messages
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from allauth.account.internal.decorators import login_stage_required
from allauth.mfa.stages import AuthenticateStage
from rest_framework.exceptions import APIException

from starview_app.services.verification_methods import send_code, verify_code
from starview_app.views.views_reauthentication import verification_context, describe_error


@login_stage_required(stage=AuthenticateStage.key, redirect_urlname='account_login')
@csrf_protect
@require_http_methods(['GET', 'POST'])
def verify_login(request):
    # Do not show a previous account's sign-in toast above this pending login.
    list(get_messages(request))
    stage = request._login_stage
    user = stage.login.user
    if (user is None or not user.is_active or stage.state.get('security_version') != user.userprofile.security_version
            or not stage.state.get('challenge_nonce')):
        return stage.abort()
    context = verification_context(request, user)
    context.update(signing_in=True, cancel_url='/accounts/2fa/authenticate/?cancel=1', messages=[])
    if request.GET.get('cancel') == '1':
        request.session.pop('account_login_verification_id', None)
        return stage.abort()
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
            context['error'] = describe_error(exc)
    return TemplateResponse(request, 'account/security_confirm.html', context)
