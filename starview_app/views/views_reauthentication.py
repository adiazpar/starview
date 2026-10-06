"""Server-rendered confirmation for the existing allauth/admin security screens."""

from django.contrib.auth.decorators import login_required
from django.contrib.messages import get_messages
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET
from rest_framework.exceptions import APIException

from starview_app.services.account_security import send_verification_code, confirm_identity
from starview_app.services.verification_methods import verification_methods, preferred_method


@login_required(login_url='/login')
@require_GET
def manage_security(request):
    from starview_app.utils.adapters import get_frontend_url
    return HttpResponseRedirect(get_frontend_url('/profile?security=1'))


def describe_error(exc):
    detail = exc.detail
    if isinstance(detail, dict):
        detail = detail.get('detail', next(iter(detail.values())))
    if isinstance(detail, (list, tuple)):
        detail = ' '.join(str(item) for item in detail)
    return str(detail)


def verification_context(request, user):
    methods = verification_methods(user)
    selected = request.POST.get('method', request.GET.get('method')) or preferred_method(user, methods)
    available = {method['id'] for method in methods if method['available']}
    if request.method != 'POST' and selected not in available:
        selected = preferred_method(user, methods)
    for method in methods:
        query = request.GET.copy()
        query['method'] = method['id']
        method['url'] = '?' + query.urlencode()
    destination = next((method.get('destination') for method in methods if method['id'] == 'email_code'), '')
    return {'method': selected, 'verification_methods': methods, 'email_destination': destination,
            'sent': False, 'error': '', 'cancel_url': '/profile'}


@login_required(login_url='/login')
@csrf_protect
def reauthenticate(request):
    # A previous sign-in toast does not belong above a new security challenge.
    list(get_messages(request))
    target = request.GET.get('next', '/profile')
    if not url_has_allowed_host_and_scheme(target, {request.get_host()}, require_https=request.is_secure()):
        target = '/profile'
    context = verification_context(request, request.user)
    if request.method == 'POST':
        try:
            if request.POST.get('action') == 'send_code':
                send_verification_code(request, context['method'])
                context['sent'] = True
            else:
                # Share the API's per-account proof budget across both surfaces.
                from starview_app.utils.throttles import AccountConfirmationThrottle
                from rest_framework.exceptions import Throttled
                limiter = AccountConfirmationThrottle()
                if not limiter.allow_request(request, None):
                    raise Throttled(wait=limiter.wait())
                confirm_identity(request, request.POST)
                from allauth.account.internal.flows.reauthentication import resume_request
                return resume_request(request) or HttpResponseRedirect(target)
        except APIException as exc:
            context['error'] = describe_error(exc)
    return TemplateResponse(request, 'account/security_confirm.html', context)
