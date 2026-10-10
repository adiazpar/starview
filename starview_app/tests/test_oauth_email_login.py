"""Email/password sign-in and recovery for accounts with linked providers."""

import re

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import caches
from django.test import TestCase

from starview_app.models import UserProfile


class OAuthEmailLoginTests(TestCase):
    def setUp(self):
        caches['default'].clear()
        caches['security'].clear()
        self.user = User.objects.create_user(
            username='oauth-email-owner', email='primary@example.test',
        )
        EmailAddress.objects.create(
            user=self.user, email=self.user.email, primary=True, verified=True,
        )
        self.account = SocialAccount.objects.create(
            user=self.user, provider='google', uid='oauth-email-subject',
            extra_data={'email': 'linked@example.test', 'email_verified': True},
        )

    def login(self, identity, password='Starview-Password123!'):
        return self.client.post('/api/auth/login/', {
            'username': identity, 'password': password,
        })

    def recover(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/auth/password-reset/', {
                'email': ' PRIMARY@EXAMPLE.TEST ',
            })
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        path = re.search(r'/password-reset-confirm/[^/\s]+/[^/\s]+/', mail.outbox[0].body).group()
        response = self.client.post('/api/auth' + path, {
            'password1': 'Starview-Password123!', 'password2': 'Starview-Password123!',
        })
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_oauth_only_failure_does_not_disclose_account_or_provider(self):
        self.assertFalse(self.user.has_usable_password())
        oauth_response = self.login(self.user.email)
        unknown_response = self.login('unknown@example.test')
        self.user.set_password('Different-Password123!')
        self.user.save(update_fields=['password'])
        wrong_response = self.login(self.user.email)
        self.assertEqual(oauth_response.status_code, 400)
        self.assertEqual(oauth_response.json(), unknown_response.json())
        self.assertEqual(oauth_response.json(), wrong_response.json())
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_oauth_account_can_set_first_password_via_primary_email_recovery(self):
        self.recover()
        response = self.login(' PRIMARY@EXAMPLE.TEST ')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get('/api/auth/status/').json()['user']['id'], self.user.pk)
        self.assertEqual(User.objects.count(), 1)
        self.assertTrue(SocialAccount.objects.filter(pk=self.account.pk, user=self.user).exists())

    def test_first_password_recovery_preserves_mfa_for_linked_account(self):
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        self.recover()
        response = self.login(self.user.email)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def set_password(self):
        self.user.set_password('Starview-Password123!')
        self.user.save(update_fields=['password'])

    def test_verified_linked_email_uses_existing_password_but_not_recovery(self):
        self.set_password()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/auth/password-reset/', {'email': 'linked@example.test'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.login(' LINKED@EXAMPLE.TEST ').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/status/').json()['user']['id'], self.user.pk)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'primary@example.test')
        self.assertEqual(list(EmailAddress.objects.filter(user=self.user).values_list('email', flat=True)),
                         ['primary@example.test'])

    def test_verified_alias_still_requires_local_password(self):
        self.assertEqual(self.login('linked@example.test').status_code, 400)
        self.set_password()
        self.assertEqual(self.login('linked@example.test', password='Wrong-Password123!').status_code, 400)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_provider_verification_claims_must_be_explicit_and_consistent(self):
        self.set_password()
        for evidence in ({}, {'email_verified': False}, {'email_verified': 'false'},
                         {'email_verified': 'true'}, {'email_verified': 1},
                         {'email_verified': None}, {'email_verified': {}},
                         {'email_verified': True, 'verified_email': False},
                         {'email_verified': False, 'verified_email': True}):
            with self.subTest(evidence=evidence):
                caches['security'].clear()
                self.account.extra_data = {'email': 'linked@example.test', **evidence}
                self.account.save(update_fields=['extra_data'])
                self.assertEqual(self.login('linked@example.test').status_code, 400)
                self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_google_legacy_and_apple_boolean_or_string_verification(self):
        self.set_password()
        for provider, evidence in (
            ('google', {'verified_email': True}),
            ('google', {'email_verified': True, 'verified_email': True}),
            ('apple', {'email_verified': True}),
            ('apple', {'email_verified': 'true'}),
        ):
            with self.subTest(provider=provider, evidence=evidence):
                self.client.logout()
                self.account.provider = provider
                self.account.extra_data = {'email': 'linked@example.test', **evidence}
                self.account.save(update_fields=['provider', 'extra_data'])
                self.assertEqual(self.login('linked@example.test').status_code, 200)

    def test_unsupported_provider_and_unverified_apple_claim_are_not_aliases(self):
        self.set_password()
        for provider, verified in (('unknown', True), ('apple', 'false'), ('apple', 1)):
            with self.subTest(provider=provider, verified=verified):
                self.account.provider = provider
                self.account.extra_data = {'email': 'linked@example.test', 'email_verified': verified}
                self.account.save(update_fields=['provider', 'extra_data'])
                self.assertEqual(self.login('linked@example.test').status_code, 400)

    def test_primary_contact_takes_precedence_over_stale_alias(self):
        self.set_password()
        other = User.objects.create_user(username='current-owner', email='linked@example.test',
                                         password='Current-Password123!')
        EmailAddress.objects.create(user=other, email=other.email, verified=True, primary=True)
        self.assertEqual(self.login(other.email).status_code, 400)
        self.assertEqual(self.login(other.email, 'Current-Password123!').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/status/').json()['user']['id'], other.pk)

    def test_other_accounts_pending_contact_blocks_alias(self):
        self.set_password()
        other = User.objects.create_user(username='pending-owner', email='other@example.test')
        EmailAddress.objects.create(user=other, email='linked@example.test', verified=False, primary=False)
        self.assertEqual(self.login('linked@example.test').status_code, 400)

    def test_alias_shared_across_accounts_is_rejected_but_same_owner_links_work(self):
        self.set_password()
        second = SocialAccount.objects.create(
            user=self.user, provider='apple', uid='second-subject',
            extra_data={'email': 'linked@example.test', 'email_verified': 'true'},
        )
        self.assertEqual(self.login('linked@example.test').status_code, 200)
        self.client.logout()
        second.user = User.objects.create_user(username='ambiguous-owner', email='other@example.test')
        second.save(update_fields=['user'])
        self.assertEqual(self.login('linked@example.test').status_code, 400)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_unverified_primary_or_inactive_account_cannot_use_alias(self):
        self.set_password()
        EmailAddress.objects.filter(user=self.user).update(verified=False)
        self.assertEqual(self.login('linked@example.test').status_code, 403)
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])
        EmailAddress.objects.filter(user=self.user).update(verified=True)
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.login('linked@example.test').status_code, 400)

    def test_alias_login_preserves_mfa(self):
        self.set_password()
        UserProfile.objects.filter(user=self.user).update(two_factor_enabled=True)
        response = self.login('linked@example.test')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['redirect_url'], '/accounts/2fa/authenticate/')
        self.assertFalse(self.client.get('/api/auth/status/').json()['authenticated'])

    def test_provider_email_update_and_disconnect_remove_alias(self):
        self.set_password()
        self.account.extra_data['email'] = 'new-linked@example.test'
        self.account.save(update_fields=['extra_data'])
        self.assertEqual(self.login('linked@example.test').status_code, 400)
        self.assertEqual(self.login('new-linked@example.test').status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(f'/api/users/me/disconnect-social/{self.account.pk}/')
        self.assertEqual(response.status_code, 200, response.content)
        self.client.logout()
        self.assertEqual(self.login('new-linked@example.test').status_code, 400)
        self.assertEqual(self.login(self.user.email).status_code, 200)
