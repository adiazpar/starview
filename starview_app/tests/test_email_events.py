from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from starview_app.models import EmailBounce, EmailComplaint, EmailSuppressionList
from starview_app.services.email_events import process_email_event


class EmailEventTests(TestCase):
    def event(self, message_id='test-message', kind='Bounce', recipients=None, subtype='Transient'):
        recipients = recipients or ['first@example.test', 'second@example.test']
        data = {'bounceType': subtype, 'bounceSubType': 'General', 'complaintFeedbackType': 'abuse',
                'bouncedRecipients' if kind == 'Bounce' else 'complainedRecipients': [
                    {'emailAddress': address} for address in recipients]}
        return process_email_event({'MessageId': message_id}, {'notificationType': kind, kind.lower(): data}, kind)

    def test_multi_recipient_retries_and_out_of_order_redelivery_are_idempotent(self):
        for kind, model in [('Bounce', EmailBounce), ('Complaint', EmailComplaint)]:
            self.assertEqual(self.event('one', kind), 2)
            self.assertEqual(self.event('two', kind), 2)
            self.assertEqual(self.event('one', kind), 0)
            self.assertEqual(model.objects.count(), 4)
        self.assertFalse(EmailBounce.objects.filter(bounce_count__gt=2).exists())

    def test_all_recipients_rollback_when_processing_fails(self):
        with patch.object(EmailSuppressionList, 'add_to_suppression', side_effect=[None, RuntimeError('database failure')]):
            with self.assertRaises(RuntimeError):
                self.event(subtype='Permanent')
        self.assertEqual(EmailBounce.objects.count(), 0)

    def test_unique_soft_failures_trigger_suppression_and_hard_cannot_be_downgraded(self):
        for index in range(3):
            self.event(str(index), recipients=['first@example.test'])
        suppression = EmailSuppressionList.objects.get(email='first@example.test')
        self.assertEqual(suppression.reason, 'soft_bounce')
        self.event('hard', recipients=['first@example.test'], subtype='Permanent')
        self.event('soft-again', recipients=['first@example.test'])
        suppression.refresh_from_db()
        self.assertEqual(suppression.reason, 'hard_bounce')

    def test_cleanup_keeps_recent_suppression_and_permanent_blocks_without_old_payloads(self):
        for index in range(3):
            self.event(str(index), recipients=['first@example.test'])
        EmailBounce.objects.filter(sns_message_id__in=['0', '1']).update(last_bounce_date=timezone.now() - timedelta(days=40))
        self.event('complaint', 'Complaint', ['complaint@example.test'])
        EmailComplaint.objects.update(complaint_date=timezone.now() - timedelta(days=100))
        self.event('hard', recipients=['hard@example.test'], subtype='Permanent')
        EmailBounce.objects.filter(bounce_type='hard').update(last_bounce_date=timezone.now() - timedelta(days=100))
        call_command('cleanup_email_suppressions', stdout=StringIO())
        self.assertTrue(EmailSuppressionList.objects.get(email='first@example.test').is_active)
        for address in ('complaint@example.test', 'hard@example.test'):
            self.assertTrue(EmailSuppressionList.objects.get(email=address).is_active)
        self.assertFalse(EmailComplaint.objects.exists())
        self.assertFalse(EmailBounce.objects.filter(bounce_type='hard').exists())
        EmailBounce.objects.update(last_bounce_date=timezone.now() - timedelta(days=40))
        call_command('cleanup_email_suppressions', stdout=StringIO())
        self.assertFalse(EmailSuppressionList.objects.get(email='first@example.test').is_active)

    def test_invalid_recipient_does_not_partially_process_message(self):
        with self.assertRaises(ValueError):
            self.event(recipients=['first@example.test', 'invalid'])
        self.assertFalse(EmailBounce.objects.exists())
