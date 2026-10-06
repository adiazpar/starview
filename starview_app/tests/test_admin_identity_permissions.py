"""Whole-account admin deletion honors cascades without opening identity writes."""

import time
from unittest.mock import patch

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
from allauth.socialaccount.models import SocialAccount, SocialToken
from django.contrib import admin
from django.contrib.auth.models import User, Permission
from django.test import TestCase, RequestFactory, Client
from django.core.exceptions import FieldDoesNotExist
from django.db import IntegrityError
from django.utils import timezone

from starview_app.models import AccountEmail, AccountVerification, UserProfile, AuditLog
from starview_app.tests import test_account_security


class AdminIdentityPermissionTests(TestCase):
    def setUp(self):
        test_account_security.AccountSecurityTests.setUp(self)
        self.admin_user = User.objects.create_superuser(
            username='identity-admin', email='admin@example.test', password='Admin-Password123!',
        )
        self.login_admin(self.admin_user)
        self.user_admin = admin.site.get_model_admin(User)

    def login_admin(self, actor):
        self.client.force_login(actor, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['starview_recent_auth'] = {'user_id': actor.pk, 'at': time.time(), 'method': 'password', 'mfa': True}
        session.save()

    def add_identity_records(self, user):
        account = SocialAccount.objects.create(user=user, provider='google', uid=f'admin-fixture-{user.pk}')
        SocialToken.objects.create(account=account, token='fixture-only')
        TOTP.activate(user, generate_totp_secret())
        AccountEmail.objects.create(user=user, encrypted_payload='fixture-only')
        AccountVerification.objects.create(
            user=user, email=user.email, session_digest='0' * 64, code_digest='0' * 64,
            expires_at=timezone.now(),
        )

    def assert_account_deleted(self, user_id):
        for model in (UserProfile, EmailAddress, SocialAccount, Authenticator, AccountEmail, AccountVerification):
            self.assertFalse(model.objects.filter(user_id=user_id).exists(), model.__name__)
        self.assertFalse(User.objects.filter(pk=user_id).exists())
        self.assertFalse(SocialToken.objects.filter(account__user_id=user_id).exists())

    def test_superuser_collector_and_normal_model_permissions_allow_identity_management(self):
        self.add_identity_records(self.user)
        request = RequestFactory().get('/')
        request.user = self.admin_user
        deleted, counts, missing, protected = self.user_admin.get_deleted_objects([self.user], request)
        self.assertTrue(deleted)
        self.assertIn('User Profiles', counts)
        self.assertFalse(missing)
        self.assertFalse(protected)
        for model in (UserProfile, EmailAddress, SocialAccount, SocialToken, Authenticator, AccountEmail):
            model_admin = admin.site.get_model_admin(model)
            self.assertTrue(model_admin.has_add_permission(request))
            self.assertTrue(model_admin.has_change_permission(request))
            self.assertTrue(model_admin.has_delete_permission(request))

    def test_superuser_single_delete_confirmation_and_post_remove_account_cascade(self):
        self.add_identity_records(self.user)
        user_id = self.user.pk
        url = f'/admin/auth/user/{user_id}/delete/'
        confirmation = self.client.get(url)
        self.assertEqual(confirmation.status_code, 200)
        self.assertFalse(confirmation.context['perms_lacking'])
        response = self.client.post(url, {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assert_account_deleted(user_id)
        self.assertTrue(User.objects.filter(pk=self.admin_user.pk).exists())

    def test_superuser_bulk_delete_confirmation_and_post_revoke_apple_before_cascade(self):
        self.add_identity_records(self.user)
        apple = SocialAccount.objects.create(user=self.user, provider='apple', uid='admin-apple-fixture')
        second = User.objects.create_user(username='delete-second', email='second@example.test')
        EmailAddress.objects.create(user=second, email=second.email, primary=True, verified=True)
        self.add_identity_records(second)
        ids = [self.user.pk, second.pk]
        data = {'action': 'delete_selected', '_selected_action': ids}
        confirmation = self.client.post('/admin/auth/user/', data)
        self.assertEqual(confirmation.status_code, 200)
        self.assertFalse(confirmation.context['perms_lacking'])

        def revoke_before_delete(account):
            self.assertEqual(account.pk, apple.pk)
            self.assertTrue(User.objects.filter(pk=account.user_id).exists())
            return True

        with patch('starview_app.services.apple_oauth.revoke_apple_credential', side_effect=revoke_before_delete) as revoke:
            response = self.client.post('/admin/auth/user/', {**data, 'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        revoke.assert_called_once()
        for user_id in ids:
            self.assert_account_deleted(user_id)

    def test_staff_with_user_delete_but_without_related_permissions_is_denied(self):
        actor = User.objects.create_user(username='delete-staff', email='staff@example.test', is_staff=True)
        actor.user_permissions.add(*Permission.objects.filter(
            content_type__app_label='auth', codename__in=('view_user', 'delete_user'),
        ))
        self.login_admin(actor)
        request = RequestFactory().get('/')
        request.user = actor
        _, _, missing, _ = self.user_admin.get_deleted_objects([self.user], request)
        self.assertIn('User Profile', missing)
        self.assertIn(EmailAddress._meta.verbose_name, missing)
        self.assertEqual(self.client.post(f'/admin/auth/user/{self.user.pk}/delete/', {'post': 'yes'}).status_code, 403)
        self.assertEqual(self.client.post('/admin/auth/user/', {
            'action': 'delete_selected', '_selected_action': [self.user.pk], 'post': 'yes',
        }).status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_staff_assigned_each_cascade_permission_can_delete_whole_account(self):
        actor = User.objects.create_user(username='authorized-staff', email='assigned@example.test', is_staff=True)
        for model in (User, UserProfile, EmailAddress):
            actor.user_permissions.add(Permission.objects.get(
                content_type__app_label=model._meta.app_label, codename=f'delete_{model._meta.model_name}',
            ))
        self.login_admin(actor)
        user_id = self.user.pk
        self.assertEqual(self.client.post(f'/admin/auth/user/{user_id}/delete/', {'post': 'yes'}).status_code, 302)
        self.assert_account_deleted(user_id)

    def test_superuser_can_edit_verified_contact_and_delete_provider_with_revocation(self):
        self.add_identity_records(self.user)
        other = Client()
        other.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')
        address = EmailAddress.objects.get(user=self.user)
        self.assertEqual(self.client.post(f'/admin/account/emailaddress/{address.pk}/change/', {
            'email': 'unproven@example.test', 'verified': 'on', 'primary': 'on', 'user': self.user.pk,
        }).status_code, 302)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'unproven@example.test')
        self.assertFalse(other.get('/api/auth/status/').json()['authenticated'])
        account = SocialAccount.objects.get(user=self.user)
        response = self.client.post(f'/admin/socialaccount/socialaccount/{account.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(SocialAccount.objects.filter(pk=account.pk).exists())
        self.assertFalse(SocialToken.objects.filter(account_id=account.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_user_delete_does_not_require_extra_recent_confirmation(self):
        session = self.client.session
        session['starview_recent_auth']['at'] -= 1201
        session.save()
        response = self.client.post(f'/admin/auth/user/{self.user.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())

    def test_editable_domain_fields_have_normal_admin_permissions(self):
        request = RequestFactory().get('/')
        request.user = self.admin_user
        for model, model_admin in admin.site._registry.items():
            if type(model_admin).__module__ != 'starview_app.admin':
                continue
            with self.subTest(model=model._meta.label):
                self.assertTrue(model_admin.has_add_permission(request))
                self.assertTrue(model_admin.has_change_permission(request))
                self.assertTrue(model_admin.has_delete_permission(request))
                for field in model_admin.get_readonly_fields(request):
                    try:
                        editable = model._meta.get_field(field).editable
                    except FieldDoesNotExist:
                        editable = False
                    self.assertFalse(editable, field)

    def test_email_ownership_conflicts_are_form_errors_and_primary_promotion_is_atomic(self):
        secondary = EmailAddress.objects.create(user=self.user, email='secondary@example.test')
        url = f'/admin/account/emailaddress/{secondary.pk}/change/'
        response = self.client.post(url, {'user': self.user.pk, 'email': self.admin_user.email,
                                          'primary': 'on', 'verified': 'on'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('email', response.context['adminform'].form.errors)
        response = self.client.post(url, {'user': self.user.pk, 'email': secondary.email,
                                          'primary': 'on', 'verified': 'on'})
        self.assertEqual(response.status_code, 302, response.content)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, secondary.email)
        self.assertEqual(EmailAddress.objects.filter(user=self.user, primary=True).count(), 1)

    def test_user_contact_edit_is_available_and_selects_unverified_primary(self):
        request = RequestFactory().get('/')
        request.user = self.admin_user
        request.session = self.client.session
        Form = self.user_admin.get_form(request, self.user)
        self.assertIn('email', Form.base_fields)
        form = Form(instance=self.user, data={'username': self.user.username, 'email': self.admin_user.email,
                                             'is_active': 'on', 'date_joined_0': '2026-10-01', 'date_joined_1': '12:00:00'})
        self.assertFalse(form.is_valid())
        self.assertIn('email', form.errors)
        self.user.email = 'admin-chosen@example.test'
        from types import SimpleNamespace
        self.user_admin.save_model(request, self.user, SimpleNamespace(changed_data=['email']), change=True)
        self.user.refresh_from_db()
        primary = EmailAddress.objects.get(user=self.user, primary=True)
        self.assertEqual(primary.email, self.user.email)
        self.assertFalse(primary.verified)
        self.assertEqual(self.user.userprofile.security_version, 1)

    def test_profile_reset_is_explicit_and_retains_required_security_metadata(self):
        self.add_identity_records(self.user)
        welcome = timezone.now()
        UserProfile.objects.filter(user=self.user).update(
            bio='Reset this profile', two_factor_enabled=True, security_version=7,
            welcome_email_queued_at=welcome, language_preference='es',
        )
        profile = UserProfile.objects.get(user=self.user)
        url = f'/admin/starview_app/userprofile/{profile.pk}/delete/'
        confirmation = self.client.get(url)
        self.assertContains(confirmation, 'Reset profile data')
        self.assertContains(confirmation, 'disables two-factor authentication')
        response = self.client.post(url, {'reset_confirm': 'yes'})
        self.assertEqual(response.status_code, 302)
        profile.refresh_from_db()
        self.assertEqual(profile.bio, '')
        self.assertEqual(profile.language_preference, 'en')
        self.assertFalse(profile.two_factor_enabled)
        self.assertEqual(profile.security_version, 8)
        self.assertEqual(profile.welcome_email_queued_at, welcome)
        self.assertFalse(Authenticator.objects.filter(user=self.user).exists())
        self.assertTrue(EmailAddress.objects.filter(user=self.user, primary=True).exists())
        self.assertTrue(SocialAccount.objects.filter(user=self.user).exists())
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())
        change = self.client.get(f'/admin/starview_app/userprofile/{profile.pk}/change/')
        self.assertContains(change, 'Reset profile data')
        self.assertNotContains(change, '>Delete</a>')

    def test_admin_audit_rows_support_explicit_edit_and_delete(self):
        event = AuditLog.objects.create(user=self.user, event_type='login_success', message='Fixture')
        url = f'/admin/starview_app/auditlog/{event.pk}/change/'
        response = self.client.post(url, {
            'user': self.user.pk, 'event_type': 'login_success', 'message': 'Administrator corrected fixture',
            'timestamp_0': '2026-10-01', 'timestamp_1': '12:00:00', 'success': 'on', 'metadata': '{}',
        })
        self.assertEqual(response.status_code, 302, response.content)
        event.refresh_from_db()
        self.assertEqual(event.message, 'Administrator corrected fixture')
        response = self.client.post(f'/admin/starview_app/auditlog/{event.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(AuditLog.objects.filter(pk=event.pk).exists())

    def test_bulk_profile_reset_uses_its_own_confirmation_and_retains_profiles(self):
        profile = self.user.userprofile
        UserProfile.objects.filter(pk=profile.pk).update(bio='Bulk reset fixture')
        data = {'action': 'reset_profiles', '_selected_action': [profile.pk]}
        confirmation = self.client.post('/admin/starview_app/userprofile/', data)
        self.assertContains(confirmation, 'Reset profile data')
        self.assertEqual(self.client.post('/admin/starview_app/userprofile/', {
            **data, 'reset_confirm': 'yes',
        }).status_code, 302)
        profile.refresh_from_db()
        self.assertEqual(profile.bio, '')
        self.assertEqual(profile.security_version, 1)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_provider_reassignment_revokes_both_owners_and_drops_old_tokens(self):
        self.add_identity_records(self.user)
        account = SocialAccount.objects.get(user=self.user)
        target = User.objects.create_user(username='provider-target', email='provider-target@example.test')
        response = self.client.post(f'/admin/socialaccount/socialaccount/{account.pk}/change/', {
            'user': target.pk, 'provider': 'google', 'uid': account.uid, 'extra_data': '{"email": "provider@example.test"}',
        })
        self.assertEqual(response.status_code, 302)
        account.refresh_from_db()
        self.assertEqual(account.user_id, target.pk)
        self.assertFalse(SocialToken.objects.filter(account=account).exists())
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 1)
        self.assertEqual(UserProfile.objects.get(user=target).security_version, 1)

    def test_concurrent_email_claim_is_rendered_as_form_error_after_rollback(self):
        class ConflictCause(Exception):
            from types import SimpleNamespace
            diag = SimpleNamespace(constraint_name='starview_email_owner_unique')

        error = IntegrityError('Fixture concurrent ownership conflict')
        error.__cause__ = ConflictCause()
        address = EmailAddress.objects.get(user=self.user)
        with patch('starview_app.services.admin_identity.save_admin_email_address', side_effect=error) as save:
            response = self.client.post(f'/admin/account/emailaddress/{address.pk}/change/', {
                'user': self.user.pk, 'email': 'concurrent@example.test', 'primary': 'on', 'verified': 'on',
            })
        self.assertEqual(response.status_code, 200)
        self.assertIn('email', response.context['adminform'].form.errors)
        save.assert_called_once()
        address.refresh_from_db()
        self.assertEqual(address.email, self.user.email)
        self.assertEqual(UserProfile.objects.get(user=self.user).security_version, 0)

    def test_staff_profile_reset_cannot_delete_authenticators_without_assigned_permission(self):
        self.add_identity_records(self.user)
        actor = User.objects.create_user(username='profile-staff', email='profile-staff@example.test', is_staff=True)
        actor.user_permissions.add(Permission.objects.get(
            content_type__app_label='starview_app', codename='delete_userprofile',
        ))
        self.login_admin(actor)
        profile = self.user.userprofile
        self.assertEqual(self.client.post(f'/admin/starview_app/userprofile/{profile.pk}/delete/', {
            'reset_confirm': 'yes',
        }).status_code, 403)
        self.assertTrue(Authenticator.objects.filter(user=self.user).exists())
        self.assertEqual(UserProfile.objects.get(pk=profile.pk).security_version, 0)
