from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.core import mail
from django.core.mail import EmailMessage
from django.test import SimpleTestCase, TestCase, override_settings

from starview_app.services.apple_relay import (
    disabled_apple_relay_emails, is_apple_relay_disabled, is_apple_relay_email,
)


class AppleRelayDomainTests(SimpleTestCase):
    def test_supported_domains_and_signed_private_claim(self):
        for email in ('one@privaterelay.appleid.com', 'two@private.icloud.com', 'THREE@PRIVATE.ICLOUD.COM'):
            self.assertTrue(is_apple_relay_email(email))
        self.assertTrue(is_apple_relay_email('future@example.test', {'is_private_email': 'true'}))
        self.assertTrue(is_apple_relay_email('future@example.test', {'is_private_email': True}))
        for email in ('one@privaterelay.appleid.com.attacker.test', 'two@icloud.com', None, ''):
            self.assertFalse(is_apple_relay_email(email))
        self.assertFalse(is_apple_relay_email('real@example.test', {'is_private_email': 'false'}))


@override_settings(EMAIL_BACKEND='starview_app.services.email_backend.EmailBackend',
                   EMAIL_DELIVERY_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AppleRelayAvailabilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='relay-availability')

    def account(self, email, *, enabled=False, provider='apple', private=None):
        data = {'email': email, 'apple_relay_enabled': enabled}
        if private is not None:
            data['is_private_email'] = private
        return SocialAccount.objects.create(user=self.user, provider=provider, uid=email, extra_data=data)

    def test_known_disabled_addresses_are_shared_by_availability_and_delivery(self):
        old = 'old@privaterelay.appleid.com'
        new = 'new@private.icloud.com'
        future = 'future@example.test'
        self.account(old)
        self.account(new)
        self.account(future, private=True)
        addresses = [old, new, future]
        self.assertEqual(disabled_apple_relay_emails(addresses), set(addresses))
        for email in addresses:
            self.assertTrue(is_apple_relay_disabled(email.upper()))
        message = EmailMessage('Test only', 'Fixture', to=addresses)
        self.assertEqual(message.send(), 0)
        self.assertTrue(message.starview_suppressed)
        self.assertEqual(len(mail.outbox), 0)

    def test_enabled_unknown_and_non_apple_addresses_are_not_suppressed(self):
        active = 'active@private.icloud.com'
        unknown = 'unknown@private.icloud.com'
        normal = 'normal@example.test'
        unrelated = 'unrelated@privaterelay.appleid.com'
        self.account(active, enabled=True)
        self.account(normal)
        self.account(unrelated, provider='google')
        addresses = [active, unknown, normal, unrelated]
        self.assertEqual(disabled_apple_relay_emails(addresses), set())
        self.assertEqual(EmailMessage('Test only', 'Fixture', to=addresses).send(), 1)
        self.assertEqual(mail.outbox[0].to, addresses)

    def test_mixed_recipients_keep_deliverable_to_cc_and_bcc(self):
        relay = 'blocked@private.icloud.com'
        self.account(relay)
        message = EmailMessage('Test only', 'Fixture', to=[f'Private <{relay}>', 'to@example.test'],
                               cc=[relay.upper(), 'cc@example.test'], bcc=[relay, 'bcc@example.test'])
        self.assertEqual(message.send(), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ['to@example.test'])
        self.assertEqual(sent.cc, ['cc@example.test'])
        self.assertEqual(sent.bcc, ['bcc@example.test'])
