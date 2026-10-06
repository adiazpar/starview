import importlib
import json
import logging
from datetime import timedelta
from unittest.mock import Mock

from botocore.exceptions import ClientError
from django.contrib.auth.models import User
from django.contrib.sessions.models import Session
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, transaction
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from django_project.log_redaction import AccountSecretFilter, redact_account_urls
from starview_app.management.commands.archive_audit_logs import Command
from starview_app.models import AccountEmail, AccountVerification, AuditLog
from starview_app.services.account_maintenance import maintain_accounts
from starview_app.utils.cache_backend import NamespacedRedisCache


class IdentityLoggingTests(SimpleTestCase):
    def test_recovery_and_oauth_url_secrets_are_not_logged(self):
        for path in (
            '/api/auth/password-reset-confirm/user-id/secret-token/',
            '/accounts/confirm-email/secret-token/',
            '/accounts/apple/login/callback/finish/?code=secret-token&state=private-state',
        ):
            record = logging.LogRecord('django.server', logging.INFO, '', 1, 'GET %s HTTP/1.1', (path,), None)
            AccountSecretFilter().filter(record)
            self.assertNotIn('secret-token', record.getMessage())
            self.assertNotIn('private-state', record.getMessage())
            self.assertIn('[redacted]', record.getMessage())
        self.assertEqual(redact_account_urls('/api/locations/2/'), '/api/locations/2/')

    def test_clearing_content_preserves_allauth_mfa_replay_and_rate_limits(self):
        cache = NamespacedRedisCache('redis://unused', {'KEY_PREFIX': 'starview'})
        client = Mock()
        content = cache.make_key('locations:list')
        rate = cache.make_key('allauth:rate:test')
        replay = cache.make_key('allauth.mfa.totp.used?user=1&code=000000')
        client.scan_iter.return_value = [key.encode() for key in (content, rate, replay)]
        cache.__dict__['_cache'] = Mock(get_client=Mock(return_value=client))
        cache.clear()
        client.delete.assert_called_once_with(content.encode())
        client.flushdb.assert_not_called()
        self.assertEqual(client.scan_iter.call_args.kwargs['match'], 'starview:1:*')


class IdentityOperationsTests(TestCase):
    def test_housekeeping_removes_expired_secrets_and_sessions(self):
        user = User.objects.create_user(username='cleanup-owner', email='cleanup@example.test')
        now = timezone.now()
        old_code = AccountVerification.objects.create(
            user=user, session_digest='test-session', email=user.email, code_digest='test-code',
            expires_at=now - timedelta(days=1),
        )
        AccountVerification.objects.filter(pk=old_code.pk).update(created_at=now - timedelta(days=2))
        expired = AccountEmail.objects.create(user=user, encrypted_payload='test-only-encrypted-payload', expires_at=now - timedelta(minutes=1))
        Session.objects.create(session_key='expired-test-session', session_data='', expire_date=now - timedelta(days=1))
        counts = maintain_accounts()
        self.assertEqual(counts['confirmation_codes'], 1)
        self.assertEqual(counts['sessions'], 1)
        expired.refresh_from_db()
        self.assertEqual(expired.encrypted_payload, '')
        self.assertEqual(expired.outcome, 'expired')
        user.delete()
        self.assertFalse(AccountEmail.objects.filter(pk=expired.pk).exists())

    def test_migration_refuses_ambiguous_legacy_ownership_without_deleting_accounts(self):
        migration = importlib.import_module('starview_app.migrations.0039_email_ownership')
        owner = User.objects.create_user(username='legacy-owner', email='legacy@example.test')
        # Roll back this entire scenario, including DDL, on the expected failure.
        with self.assertRaisesMessage(DatabaseError, 'Email ownership conflicts'), transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(migration.REVERSE)
                User.objects.create_user(username='legacy-duplicate', email='LEGACY@example.test')
                cursor.execute(migration.FORWARD)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())

    def archive_command(self):
        command = Command()
        command.r2_client = Mock()
        command.bucket_name = 'test-audit-bucket'
        command.format = 'both'
        command.days = 30
        return command

    def test_failed_archive_retains_database_rows(self):
        log = AuditLog.objects.create(event_type='login_success', message='test event')
        command = self.archive_command()
        command.r2_client.put_object.side_effect = [
            {}, ClientError({'Error': {'Code': 'Unavailable', 'Message': 'test failure'}}, 'PutObject'),
        ]
        with self.assertRaisesMessage(CommandError, 'database records were retained'):
            command.archive_logs(AuditLog.objects.filter(pk=log.pk), timezone.now())
        self.assertTrue(AuditLog.objects.filter(pk=log.pk).exists())

    def test_archive_deletes_only_the_uploaded_snapshot(self):
        first = AuditLog.objects.create(event_type='login_success', message='included')
        command = self.archive_command()
        added = []

        def upload(**kwargs):
            if kwargs['ContentType'] == 'application/json':
                archived = json.loads(kwargs['Body'])
                self.assertEqual([row['id'] for row in archived['logs']], [first.pk])
                added.append(AuditLog.objects.create(event_type='login_success', message='arrived during upload'))
            return {}

        command.r2_client.put_object.side_effect = upload
        self.assertEqual(command.archive_logs(AuditLog.objects.all(), timezone.now()), 1)
        self.assertFalse(AuditLog.objects.filter(pk=first.pk).exists())
        self.assertTrue(AuditLog.objects.filter(pk=added[0].pk).exists())
