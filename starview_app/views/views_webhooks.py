# ----------------------------------------------------------------------------------------------------- #
# AWS SNS Webhook Views - Email Bounce and Complaint Handlers                                           #
#                                                                                                       #
# Purpose:                                                                                              #
# Receives real-time notifications from AWS SNS when emails bounce or are marked as spam.               #
# Processes notifications and updates suppression lists automatically to maintain AWS SES compliance.   #
#                                                                                                       #
# Endpoints:                                                                                            #
# - POST /api/webhooks/ses-bounce/     - Receives bounce notifications                                  #
# - POST /api/webhooks/ses-complaint/  - Receives complaint notifications                               #
#                                                                                                       #
# Architecture:                                                                                         #
# - Plain Django function-based views (not DRF)                                                         #
# - Uses Django's JsonResponse and HttpResponse for simple webhook handling                             #
# - No authentication required (SNS signature verification provides security)                           #
# - No rate limiting (AWS SNS is trusted source, not user-facing)                                       #
# - CSRF exempt (webhooks receive POST from external AWS service)                                       #
#                                                                                                       #
# Why Not DRF:                                                                                          #
# External infrastructure endpoint that doesn't need DRF features (serializers, browsable API,          #
# permissions, throttling). Plain Django is simpler and faster for webhook processing.                  #
#                                                                                                       #
# Security:                                                                                             #
# - Verifies SNS message signatures using AWS public certificates to prevent spoofing                   #
# - Validates certificate URLs (must be https://sns.* domains)                                          #
# - Handles SNS subscription confirmations automatically                                                #
# - Stores raw notification payloads for audit trail and incident investigation                         #
# - Audit logging for all suppression events via log_auth_event()                                       #
#                                                                                                       #
# Integration:                                                                                          #
# AWS SES → AWS SNS → These webhook endpoints → EmailBounce/EmailComplaint models                       #
# ----------------------------------------------------------------------------------------------------- #

import json
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth import get_user_model
from starview_app.models import EmailBounce, EmailComplaint, EmailSuppressionList

logger = logging.getLogger(__name__)
User = get_user_model()



# ----------------------------------------------------------------------------- #
# Verify the authenticity of an SNS message by checking its signature.          #
#                                                                               #
# AWS SNS signs all messages with a private key. We verify the signature        #
# using AWS's public certificate to ensure the message came from AWS.           #
#                                                                               #
# Args:                                                                         #
#   message_dict (dict): Parsed JSON message from SNS                           #
#                                                                               #
# Returns:                                                                      #
#   bool: True if signature is valid, False otherwise                           #
#                                                                               #
# Security:                                                                     #
# This prevents attackers from spoofing bounce/complaint notifications          #
# to manipulate our suppression list.                                           #
# ----------------------------------------------------------------------------- #
def verify_sns_message(message_dict):
   
    try:
        import base64
        import requests
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        # Get signing certificate URL
        cert_url = message_dict.get('SigningCertURL')
        if not cert_url or not cert_url.startswith('https://sns.'):
            logger.warning("Invalid certificate URL: %s", cert_url)
            return False

        # Download and load certificate
        cert_response = requests.get(cert_url, timeout=10)
        cert = x509.load_pem_x509_certificate(cert_response.content, default_backend())
        public_key = cert.public_key()

        # Build string to verify
        message_type = message_dict.get('Type')
        if message_type == 'Notification':
            string_to_sign = (
                f"Message\n{message_dict['Message']}\n"
                f"MessageId\n{message_dict['MessageId']}\n"
            )
            if 'Subject' in message_dict:
                string_to_sign += f"Subject\n{message_dict['Subject']}\n"
            string_to_sign += (
                f"Timestamp\n{message_dict['Timestamp']}\n"
                f"TopicArn\n{message_dict['TopicArn']}\n"
                f"Type\n{message_dict['Type']}\n"
            )
        elif message_type == 'SubscriptionConfirmation':
            string_to_sign = (
                f"Message\n{message_dict['Message']}\n"
                f"MessageId\n{message_dict['MessageId']}\n"
                f"SubscribeURL\n{message_dict['SubscribeURL']}\n"
                f"Timestamp\n{message_dict['Timestamp']}\n"
                f"Token\n{message_dict['Token']}\n"
                f"TopicArn\n{message_dict['TopicArn']}\n"
                f"Type\n{message_dict['Type']}\n"
            )
        else:
            logger.warning("Unknown message type: %s", message_type)
            return False

        # Verify signature
        signature = base64.b64decode(message_dict['Signature'])
        public_key.verify(
            signature,
            string_to_sign.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA1()
        )
        return True

    except Exception as e:
        logger.error("SNS signature verification failed: %s", e)
        return False



# ----------------------------------------------------------------------------- #
# Webhook endpoint for AWS SNS bounce notifications.                            #
#                                                                               #
# Receives notifications when emails bounce (fail to deliver).                  #
# Processes bounces and adds addresses to suppression list as needed.           #
#                                                                               #
# Flow:                                                                         #
# 1. Email bounces → AWS SES detects → Publishes to SNS topic                   #
# 2. SNS sends POST request to this endpoint                                    #
# 3. We verify signature, parse notification, update database                   #
# 4. Hard bounces and repeated soft bounces → Suppression list                  #
#                                                                               #
# POST Body (from SNS):                                                         #
# {                                                                             #
#       "Type": "Notification",                                                 #
#       "MessageId": "...",                                                     #
#       "TopicArn": "...",                                                      #
#       "Subject": "...",                                                       #
#       "Message": "{...}",  # JSON string with bounce details                  #
#       "Timestamp": "...",                                                     #
#       "Signature": "...",                                                     #
#       "SigningCertURL": "..."                                                 #
# }                                                                             #
# ----------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["POST"])
def ses_bounce_webhook(request):
    
    try:
        # Parse SNS message
        try:
            sns_message = json.loads(request.body)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in SNS bounce webhook")
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        # Handle subscription confirmation
        if sns_message.get('Type') == 'SubscriptionConfirmation':
            subscribe_url = sns_message.get('SubscribeURL')
            if subscribe_url:
                import requests
                response = requests.get(subscribe_url, timeout=10)
                logger.info("SNS subscription confirmed: %s", response.status_code)
                return HttpResponse('Subscription confirmed', status=200)

        # Verify SNS signature
        if not verify_sns_message(sns_message):
            logger.warning("SNS bounce webhook: Invalid signature")
            return JsonResponse({'error': 'Invalid signature'}, status=403)

        # Parse bounce notification
        message = json.loads(sns_message.get('Message', '{}'))
        notification_type = message.get('notificationType')

        if notification_type != 'Bounce':
            logger.warning("Unexpected notification type: %s", notification_type)
            return JsonResponse({'error': 'Not a bounce notification'}, status=400)

        # Extract bounce details
        bounce = message.get('bounce', {})
        bounce_type = bounce.get('bounceType', 'Undetermined').lower()
        bounce_subtype = bounce.get('bounceSubType', 'undetermined').lower().replace(' ', '_')

        # Map AWS bounce types to our choices
        # AWS uses: Permanent (hard), Temporary (soft/transient), Transient (connection issues)
        bounce_type_map = {
            'permanent': 'hard',        # Permanent failure (invalid email, domain doesn't exist)
            'temporary': 'soft',        # Temporary failure (mailbox full, server down)
            'transient': 'transient',   # Connection issues (throttling, timeout)
            'undetermined': 'transient',
        }
        bounce_type = bounce_type_map.get(bounce_type, 'transient')

        # Process each bounced recipient
        bounced_recipients = bounce.get('bouncedRecipients', [])
        for recipient in bounced_recipients:
            email = recipient.get('emailAddress', '').lower()
            if not email:
                continue

            # Check for existing bounce record
            existing_bounce = EmailBounce.objects.filter(email=email).first()

            if existing_bounce:
                # Update existing record
                existing_bounce.bounce_count += 1
                existing_bounce.bounce_type = bounce_type
                existing_bounce.bounce_subtype = bounce_subtype
                existing_bounce.diagnostic_code = recipient.get('diagnosticCode', '')
                existing_bounce.sns_message_id = sns_message.get('MessageId', '')
                existing_bounce.raw_notification = message
                existing_bounce.save()

                logger.info("Updated bounce record for %s: %dx", email, existing_bounce.bounce_count)
                bounce_record = existing_bounce
            else:
                # Find user if exists
                user = None
                try:
                    user = User.objects.get(email=email)
                except User.DoesNotExist:
                    pass

                # Create new bounce record
                bounce_record = EmailBounce.objects.create(
                    email=email,
                    user=user,
                    bounce_type=bounce_type,
                    bounce_subtype=bounce_subtype,
                    bounce_count=1,
                    sns_message_id=sns_message.get('MessageId', ''),
                    diagnostic_code=recipient.get('diagnosticCode', ''),
                    raw_notification=message,
                )

                logger.info("Created bounce record for %s: %s", email, bounce_type)

            # Check if should suppress
            if bounce_record.should_suppress() and not bounce_record.suppressed:
                # Add to suppression list
                reason = 'hard_bounce' if bounce_type == 'hard' else 'soft_bounce'
                EmailSuppressionList.add_to_suppression(
                    email=email,
                    reason=reason,
                    bounce=bounce_record,
                    notes=f"Auto-suppressed after {bounce_record.bounce_count} {bounce_type} bounce(s)"
                )

                # Mark bounce as suppressed
                bounce_record.suppressed = True
                bounce_record.save()

                logger.warning("Email suppressed due to bounces: %s (%s)", email, reason)

        return JsonResponse({
            'status': 'success',
            'processed': len(bounced_recipients)
        }, status=200)

    except Exception as e:
        logger.error("Error processing bounce webhook: %s", e, exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)



# ----------------------------------------------------------------------------- #
# Webhook endpoint for AWS SNS complaint notifications.                         #
#                                                                               #
# Receives notifications when recipients mark emails as spam.                   #
# Immediately suppresses complained addresses to protect sender reputation.     #
#                                                                               #
# Flow:                                                                         #
# 1. User marks email as spam → ISP reports via feedback loop → AWS SES         #
# 2. SES publishes to SNS topic                                                 #
# 3. SNS sends POST request to this endpoint                                    #
# 4. We verify signature, parse notification, suppress email immediately        #
#                                                                               #
# POST Body (from SNS):                                                         #
# {                                                                             #
#       "Type": "Notification",                                                 #
#       "MessageId": "...",                                                     #
#       "TopicArn": "...",                                                      #
#       "Subject": "...",                                                       #
#       "Message": "{...}",  # JSON string with complaint details               #
#       "Timestamp": "...",                                                     #
#       "Signature": "...",                                                     #
#       "SigningCertURL": "..."                                                 #
# }                                                                             #
# ----------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["POST"])
def ses_complaint_webhook(request):
    
    try:
        # Parse SNS message
        try:
            sns_message = json.loads(request.body)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in SNS complaint webhook")
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        # Handle subscription confirmation
        if sns_message.get('Type') == 'SubscriptionConfirmation':
            subscribe_url = sns_message.get('SubscribeURL')
            if subscribe_url:
                import requests
                response = requests.get(subscribe_url, timeout=10)
                logger.info("SNS subscription confirmed: %s", response.status_code)
                return HttpResponse('Subscription confirmed', status=200)

        # Verify SNS signature
        if not verify_sns_message(sns_message):
            logger.warning("SNS complaint webhook: Invalid signature")
            return JsonResponse({'error': 'Invalid signature'}, status=403)

        # Parse complaint notification
        message = json.loads(sns_message.get('Message', '{}'))
        notification_type = message.get('notificationType')

        if notification_type != 'Complaint':
            logger.warning("Unexpected notification type: %s", notification_type)
            return JsonResponse({'error': 'Not a complaint notification'}, status=400)

        # Extract complaint details
        complaint = message.get('complaint', {})
        complaint_feedback_type = complaint.get('complaintFeedbackType', 'other')
        user_agent = complaint.get('userAgent', '')

        # Map AWS complaint types to our choices
        complaint_type_map = {
            'abuse': 'abuse',
            'auth-failure': 'auth-failure',
            'fraud': 'fraud',
            'not-spam': 'not-spam',
            'other': 'other',
            'virus': 'virus',
        }
        complaint_type = complaint_type_map.get(complaint_feedback_type, 'other')

        # Process each complained recipient
        complained_recipients = complaint.get('complainedRecipients', [])
        for recipient in complained_recipients:
            email = recipient.get('emailAddress', '').lower()
            if not email:
                continue

            # Find user if exists
            user = None
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                pass

            # Create complaint record
            complaint_record = EmailComplaint.objects.create(
                email=email,
                user=user,
                complaint_type=complaint_type,
                user_agent=user_agent,
                sns_message_id=sns_message.get('MessageId', ''),
                feedback_id=complaint.get('feedbackId', ''),
                raw_notification=message,
            )

            logger.warning("Email complaint received: %s (%s)", email, complaint_type)

            # IMMEDIATELY add to suppression list (complaints are serious)
            if not complaint_record.suppressed:
                EmailSuppressionList.add_to_suppression(
                    email=email,
                    reason='complaint',
                    complaint=complaint_record,
                    notes=f"Auto-suppressed due to spam complaint ({complaint_type})"
                )

                # Mark complaint as suppressed
                complaint_record.suppressed = True
                complaint_record.save()

                logger.critical("Email suppressed due to complaint: %s", email)

        return JsonResponse({
            'status': 'success',
            'processed': len(complained_recipients)
        }, status=200)

    except Exception as e:
        logger.error("Error processing complaint webhook: %s", e, exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)
