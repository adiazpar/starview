"""Authenticate SES/SNS envelopes before fetching URLs or changing mail state."""

import base64
import json
import logging
import re
from datetime import timedelta
from urllib.parse import urlsplit

import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


def sns_endpoint(topic):
    if not isinstance(topic, str) or topic not in settings.SES_SNS_TOPIC_ARNS:
        raise ValueError('Unrecognized SNS topic')
    match = re.fullmatch(r'arn:(aws|aws-us-gov|aws-cn):sns:([a-z0-9-]+):[0-9]{12}:[A-Za-z0-9_-]+(?:\.fifo)?', topic)
    if not match:
        raise ValueError('Invalid SNS topic')
    suffix = 'amazonaws.com.cn' if match[1] == 'aws-cn' else 'amazonaws.com'
    return f'https://sns.{match[2]}.{suffix}'


def verify_sns_message(message):
    """Raise on invalid data; only temporary AWS fetch failures warrant retries."""
    endpoint = sns_endpoint(message.get('TopicArn'))
    certificate_url = message.get('SigningCertURL')
    if not isinstance(certificate_url, str):
        raise ValueError('Missing signing certificate')
    url = urlsplit(certificate_url)
    if (url.scheme != 'https' or url.netloc != urlsplit(endpoint).netloc
            or url.query or url.fragment
            or not re.fullmatch(r'/SimpleNotificationService-[A-Za-z0-9_-]+\.pem', url.path)):
        raise ValueError('Untrusted signing certificate URL')
    algorithm = {'1': hashes.SHA1, '2': hashes.SHA256}.get(message.get('SignatureVersion'))
    if algorithm is None:
        raise ValueError('Unsupported SNS signature version')
    if message.get('Type') == 'Notification':
        fields = ['Message', 'MessageId']
        if 'Subject' in message:
            fields.append('Subject')
        fields += ['Timestamp', 'TopicArn', 'Type']
    elif message.get('Type') == 'SubscriptionConfirmation':
        fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
    else:
        raise ValueError('Unsupported SNS message type')
    if any(not isinstance(message.get(field), str) or not message[field] for field in fields):
        raise ValueError('Malformed SNS envelope')
    timestamp = parse_datetime(message['Timestamp'])
    now = timezone.now()
    if timestamp is None or timezone.is_naive(timestamp) or not now - timedelta(days=30) <= timestamp <= now + timedelta(minutes=5):
        raise ValueError('Expired SNS envelope')
    signed = ''.join(f'{field}\n{message[field]}\n' for field in fields).encode()
    signature = base64.b64decode(message['Signature'], validate=True)
    response = requests.get(certificate_url, timeout=5, allow_redirects=False)
    response.raise_for_status()
    if response.status_code != 200 or len(response.content) > 65536:
        raise ValueError('Invalid certificate response')
    cert = x509.load_pem_x509_certificate(response.content)
    cert.public_key().verify(signature, signed, padding.PKCS1v15(), algorithm())
    return endpoint


def verified_sns_request(request):
    """One ingress policy for both bounce and complaint handlers."""
    try:
        if len(request.body) > 1024 * 1024:
            raise ValueError('Oversized SNS envelope')
        message = json.loads(request.body)
        if not isinstance(message, dict):
            raise ValueError('Invalid SNS envelope')
    except (ValueError, UnicodeDecodeError):
        return None, JsonResponse({'error': 'Invalid JSON envelope'}, status=400)
    try:
        endpoint = verify_sns_message(message)
        if message['Type'] == 'SubscriptionConfirmation':
            # Never follow SubscribeURL. Use only the verified topic's AWS
            # endpoint and signed token; redirects are deliberately disabled.
            response = requests.get(endpoint + '/', params={
                'Action': 'ConfirmSubscription', 'TopicArn': message['TopicArn'], 'Token': message['Token'],
            }, timeout=5, allow_redirects=False)
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError('Unexpected subscription response')
            return None, HttpResponse('Subscription confirmed')
    except requests.RequestException:
        return None, JsonResponse({'error': 'SNS verification temporarily unavailable'}, status=503)
    except Exception as exc:
        # Do not log certificate URLs, subscription tokens, or message bodies.
        logger.warning('SNS envelope rejected: exception=%s', type(exc).__name__)
        return None, JsonResponse({'error': 'Invalid SNS signature or topic'}, status=403)
    return message, None
