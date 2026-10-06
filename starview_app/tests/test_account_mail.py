from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from starview_app.models import AccountEmail
from starview_app.services.account_mail import deliver_account_email, enqueue_account_email


class AccountMailTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='mail-owner', email='owner@example.test')

    def message(self):
        message = EmailMultiAlternatives('Welcome', 'Private recovery link: test-only-token',
                                         'noreply@example.test', [self.user.email])
        message.attach_alternative('<p>Welcome</p>', 'text/html')
        return message

    def test_welcome_is_queued_once_and_delivered_after_commit(self):
        with self.captureOnCommitCallbacks(execute=True):
            one = enqueue_account_email(self.message(), user=self.user, deduplication_key=f'welcome:{self.user.pk}')
            two = enqueue_account_email(self.message(), user=self.user, deduplication_key=f'welcome:{self.user.pk}')
            self.assertEqual(one.pk, two.pk)
            self.assertNotIn('test-only-token', one.encrypted_payload)
            self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].alternatives[0].content, '<p>Welcome</p>')
        one.refresh_from_db()
        self.assertEqual(one.outcome, 'sent')
        self.assertEqual(one.encrypted_payload, '')
        self.assertFalse(deliver_account_email(one.pk))
        self.assertEqual(len(mail.outbox), 1)

    def test_failure_retains_encrypted_payload_then_retries(self):
        with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=OSError('private upstream text')):
            with self.captureOnCommitCallbacks(execute=True):
                record = enqueue_account_email(self.message(), user=self.user)
        record.refresh_from_db()
        self.assertEqual(record.last_error, 'OSError')
        self.assertIsNone(record.completed_at)
        self.assertTrue(record.encrypted_payload)
        self.assertFalse(deliver_account_email(record.pk))  # Backoff respected.
        AccountEmail.objects.filter(pk=record.pk).update(next_attempt_at=timezone.now())
        self.assertTrue(deliver_account_email(record.pk))
        self.assertEqual(len(mail.outbox), 1)

    def test_rollback_never_delivers(self):
        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    enqueue_account_email(self.message(), user=self.user)
                    raise ValueError('abort account mutation')
            except ValueError:
                pass
        self.assertFalse(AccountEmail.objects.exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_expired_messages_are_discarded_without_delivery(self):
        record = enqueue_account_email(self.message(), user=self.user)
        AccountEmail.objects.filter(pk=record.pk).update(created_at=timezone.now() - timedelta(days=15))
        self.assertFalse(deliver_account_email(record.pk))
        record.refresh_from_db()
        self.assertEqual(record.outcome, 'expired')
        self.assertEqual(record.encrypted_payload, '')

    def test_secret_key_rotation_can_deliver_old_queued_payloads(self):
        with override_settings(SECRET_KEY='test-old-key', SECRET_KEY_FALLBACKS=[]):
            record = enqueue_account_email(self.message())
        with override_settings(SECRET_KEY='test-new-key', SECRET_KEY_FALLBACKS=['test-old-key']):
            self.assertTrue(deliver_account_email(record.pk))

    def test_zero_transport_acceptances_are_retried_not_silently_discarded(self):
        with patch('django.core.mail.EmailMultiAlternatives.send', return_value=0):
            with self.captureOnCommitCallbacks(execute=True):
                record = enqueue_account_email(self.message(), user=self.user)
        record.refresh_from_db()
        self.assertIsNone(record.completed_at)
        self.assertTrue(record.encrypted_payload)
        self.assertEqual(record.last_error, 'RuntimeError')

    @override_settings(EMAIL_BACKEND='starview_app.services.email_backend.EmailBackend',
                       EMAIL_DELIVERY_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_disabled_apple_relay_is_explicitly_suppressed(self):
        from allauth.socialaccount.models import SocialAccount
        relay = 'disabled@privaterelay.appleid.com'
        SocialAccount.objects.create(user=self.user, provider='apple', uid='relay-disabled',
                                     extra_data={'email': relay, 'apple_relay_enabled': False})
        message = self.message()
        message.to = [relay]
        with self.captureOnCommitCallbacks(execute=True):
            record = enqueue_account_email(message, user=self.user)
        record.refresh_from_db()
        self.assertEqual(record.outcome, 'suppressed')
        self.assertFalse(record.encrypted_payload)
        self.assertEqual(len(mail.outbox), 0)
