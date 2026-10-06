from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from starview_app.services.account_security import security_status, send_verification_code, confirm_identity, validate_security_payload
from starview_app.utils.throttles import AccountConfirmationThrottle


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AccountConfirmationThrottle])
def account_security(request):
    if request.method == 'POST':
        confirm_identity(request, request.data)
    return Response(security_status(request))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AccountConfirmationThrottle])
def account_security_code(request):
    validate_security_payload(request.data)
    send_verification_code(request, request.data.get('method', 'email_code'))
    return Response({'detail': 'Check your verification email for a confirmation code.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AccountConfirmationThrottle])
def account_security_methods(request):
    from starview_app.services.mfa_management import method_status, manage_method
    if request.method == 'POST':
        # The service checks each action's policy against the locked account.
        return Response(manage_method(request._request, request.data))
    # This overview contains availability/counts only, never QR secrets or codes.
    # Viewing settings must not itself start an identity challenge.
    return Response(method_status(request._request))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def account_recovery_codes(request):
    from starview_app.services.mfa_management import recovery_codes
    return Response({'codes': recovery_codes(request._request)})
