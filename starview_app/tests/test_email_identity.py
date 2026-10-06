import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from unittest.mock import patch

from allauth.account.models import EmailAddress, EmailConfirmation
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.conf import settings
from django.core import mail
from django.core.cache import caches
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from starview_app.models import AccountEmail, UserProfile
from starview_app.services.account_maintenance import maintain_accounts
from starview_app.services.email_identity import email_owners


class EmailIdentityTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(username='contact-owner', email='old@example.test', password='Original-Password123!')
        self.primary = EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time(), 'method': 'password'}
        session.save()

    def change(self, email):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch('/api/users/me/update-email/', {'new_email': email}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        return EmailConfirmation.objects.get(email_address__email=email)

    def test_new_change_invalidates_old_link_without_changing_primary(self):
        first = self.change('first@example.test')
        second = self.change('second@example.test')
        self.assertEqual(EmailAddress.objects.filter(user=self.user, primary=False).count(), 1)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'old@example.test')
        self.assertIn('expired', self.client.get(f'/accounts/confirm-email/{first.key}/').url)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.get(f'/accounts/confirm-email/{second.key}/')
        self.assertIn('/email-verified?', response.url)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'second@example.test')
        self.assertEqual(EmailAddress.objects.get(user=self.user).email, self.user.email)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        self.assertIn('expired', self.client.get(f'/accounts/confirm-email/{second.key}/').url)

    def test_expired_pending_change_releases_address_without_deleting_user(self):
        confirmation = self.change('pending@example.test')
        EmailConfirmation.objects.filter(pk=confirmation.pk).update(sent=timezone.now() - timedelta(days=4))
        self.assertIn('expired', self.client.get(f'/accounts/confirm-email/{confirmation.key}/').url)
        counts = maintain_accounts()
        self.assertEqual(counts['pending_email_changes'], 1)
        self.assertFalse(email_owners('pending@example.test').exists())
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(EmailAddress.objects.filter(pk=self.primary.pk, verified=True).exists())

    def test_normalized_ownership_is_enforced_for_direct_database_writes(self):
        other = User.objects.create_user(username='other-owner', email='other@example.test')
        for operation in (
            lambda: User.objects.create_user(username='duplicate', email=' OLD@example.test '),
            lambda: EmailAddress.objects.create(user=other, email='Old@example.test'),
            lambda: User.objects.filter(pk=other.pk).update(email=' OLD@example.test '),
        ):
            with self.assertRaises(IntegrityError), transaction.atomic():
                operation()
        # The user's own matching primary email remains legitimate.
        self.primary.email = ' OLD@example.test '
        self.primary.save()
        self.primary.refresh_from_db()
        self.assertEqual(self.primary.email, 'old@example.test')

    def test_pending_address_blocks_registration_with_clear_error(self):
        self.change('pending@example.test')
        response = Client().post('/api/auth/register/', {
            'email': 'PENDING@example.test', 'first_name': 'Test', 'last_name': 'Observer',
            'password1': 'New-Password123!', 'password2': 'New-Password123!',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('already registered', str(response.json()))

    def reset_url(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = PasswordResetTokenGenerator().make_token(self.user)
        return f'/api/auth/password-reset-confirm/{uid}/{token}/'

    def test_passwordless_recovery_sets_password_but_preserves_mfa(self):
        self.user.set_unusable_password()
        self.user.save(update_fields=['password'])
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        client = Client()
        url = self.reset_url()
        response = client.post(url, {'password1': 'Recovered-Password123!', 'password2': 'Recovered-Password123!'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Authenticator.objects.filter(user=self.user, type='totp').exists())
        self.assertFalse(client.get('/api/auth/status/').json()['authenticated'])
        response = client.post('/api/auth/login/', {'username': self.user.email, 'password': 'Recovered-Password123!'})
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertEqual(client.post(url, {'password1': 'Another-Password123!', 'password2': 'Another-Password123!'}).status_code, 400)

    def test_reset_rejects_inactive_or_unverified_accounts(self):
        url = self.reset_url()
        for field in ('verified', 'is_active'):
            if field == 'verified':
                EmailAddress.objects.filter(pk=self.primary.pk).update(verified=False)
            else:
                EmailAddress.objects.filter(pk=self.primary.pk).update(verified=True)
                User.objects.filter(pk=self.user.pk).update(is_active=False)
            response = Client().post(url, {'password1': 'New-Password123!', 'password2': 'New-Password123!'})
            self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Original-Password123!'))

    def test_welcome_survives_receipt_retention_without_resending(self):
        from starview_app.utils.adapters import send_welcome_email
        request = self.client.get('/api/auth/status/').wsgi_request
        with self.captureOnCommitCallbacks(execute=True):
            send_welcome_email(request, self.user)
        self.assertEqual(len(mail.outbox), 1)
        AccountEmail.objects.filter(user=self.user).update(completed_at=timezone.now() - timedelta(days=31))
        maintain_accounts()
        with self.captureOnCommitCallbacks(execute=True):
            send_welcome_email(request, self.user)
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(AccountEmail.objects.filter(user=self.user).exists())


class VerificationResendTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(username='resend-owner', email='resend@example.test')
        self.address = EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True)
        self.old = EmailConfirmation.create(self.address)
        EmailConfirmation.objects.filter(pk=self.old.pk).update(sent=timezone.now())

    def resend(self, email=None, client=None):
        with self.captureOnCommitCallbacks(execute=True):
            return (client or self.client).post('/api/auth/resend-verification/', {'email': email or self.user.email})

    def test_public_result_does_not_disclose_eligibility(self):
        expected = self.resend().json()
        self.assertEqual(self.resend('missing@example.test').json(), expected)
        self.address.verified = True
        self.address.save()
        self.assertEqual(self.resend().json(), expected)
        self.assertEqual(len(mail.outbox), 1)

    def test_generic_cooldown_matches_mailbox_policy_for_every_eligibility_result(self):
        from allauth.core.internal.ratelimit import parse_rate

        policy = parse_rate(settings.ACCOUNT_RATE_LIMITS['confirm_email'])
        self.assertEqual(policy.per, 'key')
        self.assertEqual(policy.duration, settings.ACCOUNT_EMAIL_RESEND_COOLDOWN)
        for username, verified, active in (('verified-resend', True, True), ('inactive-resend', False, False)):
            user = User.objects.create_user(username=username, email=f'{username}@example.test', is_active=active)
            EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=verified)
        # The repeated pending contact is mailbox-rate-limited; every case still
        # advertises the same policy without revealing account eligibility.
        for email in (self.user.email, self.user.email, 'missing@example.test',
                      'verified-resend@example.test', 'inactive-resend@example.test'):
            with self.subTest(email=email):
                response = self.resend(email, client=Client(REMOTE_ADDR='192.0.2.4'))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['resend_after'], settings.ACCOUNT_EMAIL_RESEND_COOLDOWN)
        self.assertEqual(len(mail.outbox), 1)

    def test_success_replaces_old_confirmation_once_per_mailbox(self):
        self.assertEqual(self.resend().status_code, 200)
        replacement = EmailConfirmation.objects.get(email_address=self.address)
        self.assertNotEqual(replacement.key, self.old.key)
        # A different caller cannot bypass allauth's destination limit.
        self.assertEqual(self.resend(client=Client(REMOTE_ADDR='192.0.2.2')).status_code, 200)
        self.assertEqual(EmailConfirmation.objects.get(email_address=self.address).key, replacement.key)
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_enqueue_preserves_old_confirmation(self):
        with patch('starview_app.services.account_mail.enqueue_account_email', side_effect=OSError('test-only outage')):
            self.assertEqual(self.resend().status_code, 200)
        self.assertTrue(EmailConfirmation.objects.filter(pk=self.old.pk, sent__isnull=False).exists())
        self.assertEqual(EmailConfirmation.objects.filter(email_address=self.address).count(), 1)
        self.assertFalse(AccountEmail.objects.exists())

    def test_verified_or_inactive_contacts_are_not_resent(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertEqual(self.resend().status_code, 200)
        self.assertEqual(EmailConfirmation.objects.get(email_address=self.address).key, self.old.key)
        self.assertEqual(len(mail.outbox), 0)


class EmailOwnershipRaceTests(TransactionTestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        from starview_app.services import badge_service
        badge_service._BADGE_CACHE_BY_SLUG.clear()
        badge_service._BADGE_CACHE_BY_CATEGORY.clear()

    def test_resend_rechecks_contact_after_waiting_for_confirmation(self):
        from starview_app.services.email_identity import resend_primary_confirmation
        from django.test import RequestFactory

        caches['default'].clear()
        user = User.objects.create_user(username='resend-race', email='resend-race@example.test')
        address = EmailAddress.objects.create(user=user, email=user.email, primary=True)
        started = Event()
        waiter_pid = []

        def resend():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    waiter_pid.append(cursor.fetchone()[0])
                started.set()
                request = RequestFactory().post('/', REMOTE_ADDR='192.0.2.3')
                return resend_primary_confirmation(request, user.email)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=user.pk)
                future = pool.submit(resend)
                self.assertTrue(started.wait(5))
                blocked = False
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT wait_event FROM pg_stat_activity WHERE pid = %s', [waiter_pid[0]])
                        row = cursor.fetchone()
                    if row and row[0] == 'transactionid':
                        blocked = True
                        break
                    time.sleep(.01)
                self.assertTrue(blocked, 'Resend never waited on the shared account lock')
                EmailAddress.objects.filter(pk=address.pk).update(verified=True)
            self.assertFalse(future.result(timeout=5))
        self.assertFalse(EmailConfirmation.objects.filter(email_address=address).exists())
        self.assertFalse(AccountEmail.objects.exists())

    def test_contact_claim_blocks_concurrent_signup_across_tables(self):
        owner = User.objects.create_user(username='first-owner', email='owner@example.test')
        inserted, release, second_started = Event(), Event(), Event()
        second_pid = []

        def reserve():
            close_old_connections()
            try:
                with transaction.atomic():
                    EmailAddress.objects.create(user_id=owner.pk, email='race@example.test')
                    inserted.set()
                    if not release.wait(10):
                        raise TimeoutError('Claim test did not release the first transaction')
            finally:
                connection.close()

        def register():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    second_pid.append(cursor.fetchone()[0])
                second_started.set()
                try:
                    with transaction.atomic():
                        User.objects.create_user(username='loser', email='RACE@example.test')
                except IntegrityError:
                    return 'conflict'
                return 'claimed'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(reserve)
            self.assertTrue(inserted.wait(5))
            second = pool.submit(register)
            self.assertTrue(second_started.wait(5))
            try:
                # Prove the second statement waits on the first transaction,
                # then verifies ownership using a fresh snapshot after it commits.
                deadline = time.monotonic() + 5
                blocked = False
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT wait_event FROM pg_stat_activity WHERE pid = %s', [second_pid[0]])
                        row = cursor.fetchone()
                    if row and row[0] == 'advisory':
                        blocked = True
                        break
                    time.sleep(.01)
                self.assertTrue(blocked, 'Concurrent claim never waited on the email ownership lock')
            finally:
                release.set()
            first.result(timeout=5)
            self.assertEqual(second.result(timeout=5), 'conflict')
        self.assertEqual(list(email_owners('race@example.test').values_list('pk', flat=True)), [owner.pk])
        self.assertFalse(User.objects.filter(username='loser').exists())

    def test_reset_token_is_consumed_once_during_simultaneous_requests(self):
        from starview_app.services.password_service import PasswordService
        user = User.objects.create_user(username='recover-owner', email='recover@example.test', password='Original-Password123!')
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = PasswordResetTokenGenerator().make_token(user)
        url = f'/api/auth/password-reset-confirm/{uid}/{token}/'
        entered, release, second_started = Event(), Event(), Event()
        second_pid = []
        original_set_password = PasswordService.set_password

        def held_password_change(user, password):
            entered.set()
            if not release.wait(10):
                raise TimeoutError('Reset test did not release the first transaction')
            return original_set_password(user, password)

        def reset(password, second=False):
            close_old_connections()
            try:
                if second:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_backend_pid()')
                        second_pid.append(cursor.fetchone()[0])
                    second_started.set()
                return Client().post(url, {'password1': password, 'password2': password}).status_code
            finally:
                connection.close()

        with patch.object(PasswordService, 'set_password', side_effect=held_password_change) as set_password, ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(reset, 'First-Recovered123!')
            self.assertTrue(entered.wait(5))
            second = pool.submit(reset, 'Second-Recovered123!', True)
            self.assertTrue(second_started.wait(5))
            try:
                blocked = False
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT wait_event FROM pg_stat_activity WHERE pid = %s', [second_pid[0]])
                        row = cursor.fetchone()
                    if row and row[0] == 'transactionid':
                        blocked = True
                        break
                    time.sleep(.01)
                self.assertTrue(blocked, 'Concurrent reset never waited for the account lock')
            finally:
                release.set()
            self.assertEqual(first.result(timeout=5), 200)
            self.assertEqual(second.result(timeout=5), 400)
            self.assertEqual(set_password.call_count, 1)
        user.refresh_from_db()
        self.assertTrue(user.check_password('First-Recovered123!'))
