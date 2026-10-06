import base64
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from django.test import SimpleTestCase, override_settings

from starview_app.services.sns_notifications import verify_sns_message

TOPIC = 'arn:aws:sns:us-east-1:123456789012:starview-bounces'
ENDPOINT = 'https://sns.us-east-1.amazonaws.com'


@override_settings(SES_SNS_TOPIC_ARNS=(TOPIC,))
class SNSVerificationTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'SNS fixture')])
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(cls.key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
                .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1)).sign(cls.key, hashes.SHA256()))
        cls.pem = cert.public_bytes(serialization.Encoding.PEM)

    def envelope(self, version='2', subscription=False):
        message = {'Type': 'SubscriptionConfirmation' if subscription else 'Notification', 'TopicArn': TOPIC,
                   'SigningCertURL': ENDPOINT + '/SimpleNotificationService-test.pem', 'SignatureVersion': version,
                   'Message': '{}', 'MessageId': 'test-message', 'Timestamp': datetime.now(timezone.utc).isoformat()}
        fields = ['Message', 'MessageId']
        if subscription:
            message.update(SubscribeURL='http://127.0.0.1/private', Token='signed-test-token')
            fields.append('SubscribeURL')
        fields.append('Timestamp')
        if subscription:
            fields.append('Token')
        fields += ['TopicArn', 'Type']
        signed = ''.join(f'{field}\n{message[field]}\n' for field in fields).encode()
        message['Signature'] = base64.b64encode(self.key.sign(signed, padding.PKCS1v15(),
                                                            hashes.SHA256() if version == '2' else hashes.SHA1())).decode()
        return message

    @patch('starview_app.services.sns_notifications.requests.get')
    def test_valid_versions_verify_without_following_redirects(self, get):
        get.return_value = Mock(status_code=200, content=self.pem)
        for version in ('1', '2'):
            self.assertEqual(verify_sns_message(self.envelope(version)), ENDPOINT)
        self.assertEqual(get.call_args.kwargs, {'timeout': 5, 'allow_redirects': False})

    @patch('starview_app.services.sns_notifications.requests.get')
    def test_untrusted_certificates_and_topics_never_trigger_requests(self, get):
        for url in ('https://sns.evil.example/cert.pem', 'https://sns.us-east-1.amazonaws.com.evil.example/cert.pem',
                    'https://sns.us-east-1.amazonaws.com@127.0.0.1/cert.pem', ENDPOINT + ':8443/cert.pem',
                    ENDPOINT + '/SimpleNotificationService-test.pem?redirect=http://127.0.0.1'):
            message = self.envelope()
            message['SigningCertURL'] = url
            with self.assertRaises(ValueError):
                verify_sns_message(message)
        message = self.envelope()
        message['TopicArn'] = TOPIC.replace('123456789012', '999999999999')
        with self.assertRaises(ValueError):
            verify_sns_message(message)
        get.assert_not_called()

    @patch('starview_app.services.sns_notifications.requests.get')
    def test_forged_subscription_is_rejected_before_confirmation(self, get):
        get.return_value = Mock(status_code=200, content=self.pem)
        message = self.envelope(subscription=True)
        message['Token'] = 'tampered'
        for endpoint in ('ses-bounce', 'ses-complaint'):
            response = self.client.post(f'/api/webhooks/{endpoint}/', json.dumps(message), content_type='text/plain')
            self.assertEqual(response.status_code, 403)
        self.assertEqual(get.call_count, 2)  # Only the trusted certificate, never a subscription URL.
        self.assertTrue(all('params' not in call.kwargs for call in get.call_args_list))

    @patch('starview_app.services.sns_notifications.requests.get')
    def test_verified_subscription_uses_derived_aws_endpoint(self, get):
        get.side_effect = [Mock(status_code=200, content=self.pem), Mock(status_code=200)]
        response = self.client.post('/api/webhooks/ses-bounce/', json.dumps(self.envelope(subscription=True)), content_type='text/plain')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(get.call_args.args, (ENDPOINT + '/',))
        self.assertEqual(get.call_args.kwargs['params']['TopicArn'], TOPIC)
        self.assertFalse(get.call_args.kwargs['allow_redirects'])

    @override_settings(SES_SNS_TOPIC_ARNS=())
    @patch('starview_app.services.sns_notifications.requests.get')
    def test_missing_allowlist_fails_closed_and_malformed_input_returns_400(self, get):
        response = self.client.post('/api/webhooks/ses-bounce/', json.dumps(self.envelope()), content_type='text/plain')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post('/api/webhooks/ses-bounce/', '[]', content_type='text/plain').status_code, 400)
        get.assert_not_called()

    @patch('starview_app.services.sns_notifications.requests.get')
    def test_expired_future_and_naive_envelopes_are_rejected_before_fetch(self, get):
        for timestamp in ((datetime.now(timezone.utc) - timedelta(days=31)).isoformat(),
                          (datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat(),
                          datetime.now().isoformat()):
            message = self.envelope()
            message['Timestamp'] = timestamp
            with self.assertRaisesRegex(ValueError, 'Expired SNS envelope'):
                verify_sns_message(message)
        get.assert_not_called()
