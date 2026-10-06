import time
from types import SimpleNamespace

from allauth.account.models import EmailAddress
from allauth.core import context
from allauth.mfa.recovery_codes.internal.flows import generate_recovery_codes
from allauth.mfa.totp.internal.auth import generate_totp_secret
from allauth.mfa.totp.internal.flows import activate_totp, deactivate_totp
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import caches
from django.test import TestCase, override_settings

from starview_app.models import AuditLog, UserProfile


@override_settings(DEBUG=False)
class AccountEventTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(username='event-owner', email='events@example.test')
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')

    def test_mfa_lifecycle_notifies_and_revokes_without_logging_secrets(self):
        request = self.client.get('/api/auth/status/').wsgi_request
        secret = generate_totp_secret()
        with context.request_context(request), self.captureOnCommitCallbacks(execute=True):
            authenticator, recovery = activate_totp(request, SimpleNamespace(secret=secret))
        self.assertIsNotNone(recovery)
        self.assertEqual(request.session['identity_version'], 1)
        self.assertTrue(request.session['starview_recent_auth']['mfa'])
        with context.request_context(request), self.captureOnCommitCallbacks(execute=True):
            generate_recovery_codes(request)
        with context.request_context(request), self.captureOnCommitCallbacks(execute=True):
            deactivate_totp(request, authenticator)
        self.assertEqual(request.session['identity_version'], 3)
        self.assertEqual(list(AuditLog.objects.filter(user=self.user).order_by('pk').values_list('event_type', flat=True)),
                         ['mfa_enabled', 'mfa_recovery_reset', 'mfa_method_removed'])
        self.assertEqual(len(mail.outbox), 3)
        for message in mail.outbox:
            self.assertNotIn(secret, message.body)
            self.assertEqual(message.alternatives[0].mimetype, 'text/html')
            self.assertIn('logo-light.png', message.alternatives[0].content)
            self.assertNotIn(secret, message.alternatives[0].content)
        self.assertNotIn(secret, str(list(AuditLog.objects.values('metadata', 'message'))))

    def staff_session(self):
        from allauth.mfa.totp.internal.auth import TOTP
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        TOTP.activate(self.user, generate_totp_secret())
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': self.user.pk, 'at': time.time(), 'method': 'mfa', 'mfa': True}
        session.save()

    def test_admin_contact_edit_synchronizes_verified_primary_and_revokes_other_sessions(self):
        self.staff_session()
        address = EmailAddress.objects.get(user=self.user)
        response = self.client.post(f'/admin/account/emailaddress/{address.pk}/change/', {
            'user': self.user.pk, 'email': 'unproven@example.test', 'verified': 'on', 'primary': 'on',
        })
        self.assertEqual(response.status_code, 302)
        address.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(address.email, 'unproven@example.test')
        self.assertEqual(address.email, self.user.email)
        self.assertTrue(address.verified)
        self.assertTrue(address.primary)
        self.assertEqual(self.user.userprofile.security_version, 1)

    def test_admin_password_change_revokes_target_sessions_and_records_actor(self):
        from django.test import Client
        self.staff_session()
        target = User.objects.create_user(username='managed', email='managed@example.test', password='Old-Password123!')
        EmailAddress.objects.create(user=target, email=target.email, primary=True, verified=True)
        other = Client()
        other.force_login(target, backend='django.contrib.auth.backends.ModelBackend')
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'/admin/auth/user/{target.pk}/password/', {
                'password1': 'Changed-Password123!', 'password2': 'Changed-Password123!', 'usable_password': 'true',
            })
        self.assertEqual(response.status_code, 302, response.content)
        target.refresh_from_db()
        self.assertTrue(target.check_password('Changed-Password123!'))
        self.assertFalse(other.get('/api/auth/status/').json()['authenticated'])
        event = AuditLog.objects.get(user=target, event_type='password_changed')
        self.assertEqual(event.metadata['actor_id'], self.user.pk)
        self.assertEqual(len(mail.outbox), 1)
