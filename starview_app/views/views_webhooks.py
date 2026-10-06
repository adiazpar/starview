"""Verified SES webhooks. Shared services own authentication and event processing."""

import json
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from starview_app.services.sns_notifications import verified_sns_request
from starview_app.services.email_events import process_email_event

logger = logging.getLogger(__name__)


def _ses_webhook(request, kind):
    envelope, early_response = verified_sns_request(request)
    if early_response is not None:
        return early_response
    try:
        message = json.loads(envelope['Message'])
        processed = process_email_event(envelope, message, kind)
    except (ValueError, TypeError, KeyError):
        return JsonResponse({'error': 'Invalid SES notification'}, status=400)
    except Exception as exc:
        logger.error('SES processing failed: kind=%s exception=%s', kind, type(exc).__name__)
        return JsonResponse({'error': 'Email event processing temporarily unavailable'}, status=503)
    return JsonResponse({'status': 'success', 'processed': processed})


@csrf_exempt
@require_POST
def ses_bounce_webhook(request):
    return _ses_webhook(request, 'Bounce')


@csrf_exempt
@require_POST
def ses_complaint_webhook(request):
    return _ses_webhook(request, 'Complaint')
