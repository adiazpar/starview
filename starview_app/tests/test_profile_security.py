"""Profile ownership, concurrent account changes, and page query boundaries."""
from fnmatch import fnmatch
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from allauth.account.models import EmailAddress
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from starview_app.models import FavoriteLocation, Follow, Location, Review, UserProfile, Vote
from starview_app.serializers import PublicUserSerializer
from starview_app.views.views_user import UserProfileViewSet
from starview_app.utils.cache_backend import NamespacedRedisCache


class ProfileSecurityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='profile-owner', email='profile@example.test')
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.other = User.objects.create_user(username='other-profile', email='other@example.test')
        EmailAddress.objects.create(user=self.other, email=self.other.email, primary=True, verified=True)
        self.client.force_login(self.user, backend='django.contrib.auth.backends.ModelBackend')

    def call_with_stale_user(self, action, data, method='patch'):
        request = getattr(APIRequestFactory(), method)('/api/users/me/', data, format='json')
        force_authenticate(request, user=self.user)
        return UserProfileViewSet.as_view({method: action})(request)

    def test_profile_edits_preserve_concurrent_security_change(self):
        cases = (
            ('update_bio', {'bio': 'A short bio'}, 'patch'),
            ('update_unit_preference', {'unit_preference': 'imperial'}, 'patch'),
            ('update_language_preference', {'language_preference': 'es'}, 'patch'),
            ('remove_picture', {}, 'delete'),
        )
        for action, data, method in cases:
            with self.subTest(action=action):
                self.user = User.objects.get(pk=self.user.pk)
                stale_profile = self.user.userprofile
                old_updated = stale_profile.updated_at
                UserProfile.objects.filter(user=self.user).update(
                    security_version=stale_profile.security_version + 1,
                    two_factor_enabled=True, two_factor_email='security@example.test',
                )
                with patch('starview_app.services.badge_service.BadgeService.check_profile_complete_badge'):
                    response = self.call_with_stale_user(action, data, method)
                self.assertEqual(response.status_code, 200)
                fresh = UserProfile.objects.get(user=self.user)
                self.assertEqual(fresh.security_version, stale_profile.security_version + 1)
                self.assertTrue(fresh.two_factor_enabled)
                self.assertEqual(fresh.two_factor_email, 'security@example.test')
                self.assertGreater(fresh.updated_at, old_updated)

    def test_name_and_username_edits_preserve_concurrent_password_and_account_state(self):
        for action, data in (
            ('update_name', {'first_name': 'Updated', 'last_name': 'Name'}),
            ('update_username', {'new_username': 'renamed-profile'}),
        ):
            with self.subTest(action=action):
                self.user = User.objects.get(pk=self.user.pk)
                newer = User.objects.get(pk=self.user.pk)
                newer.set_password('New-Account-Password123!')
                User.objects.filter(pk=newer.pk).update(password=newer.password, is_staff=True)
                response = self.call_with_stale_user(action, data)
                self.assertEqual(response.status_code, 200)
                fresh = User.objects.get(pk=self.user.pk)
                self.assertTrue(fresh.check_password('New-Account-Password123!'))
                self.assertTrue(fresh.is_staff)

    def test_failed_picture_change_keeps_original_file_and_database_pointer(self):
        UserProfile.objects.filter(user=self.user).update(profile_picture='profile_pics/original.png')
        for action in ('upload_picture', 'remove_picture'):
            with self.subTest(action=action):
                self.user = User.objects.get(pk=self.user.pk)
                request = SimpleNamespace(user=self.user, FILES={
                    'profile_picture': SimpleUploadedFile('replacement.png', b'test-image', content_type='image/png'),
                })
                with patch('starview_app.utils.validate_file_size'), patch('starview_app.utils.validate_image_file'), \
                        patch.object(UserProfile, 'save', side_effect=RuntimeError('simulated save failure')), \
                        patch('starview_app.views.views_user.safe_delete_file') as delete_file:
                    with self.assertRaises(RuntimeError):
                        getattr(UserProfileViewSet(), action)(request)
                delete_file.assert_not_called()
                self.assertEqual(UserProfile.objects.get(user=self.user).profile_picture.name, 'profile_pics/original.png')

    def test_successful_picture_replacement_deletes_original_only_after_commit(self):
        UserProfile.objects.filter(user=self.user).update(profile_picture='profile_pics/original.png')
        self.user = User.objects.get(pk=self.user.pk)
        request = SimpleNamespace(user=self.user, FILES={
            'profile_picture': SimpleUploadedFile('replacement.png', b'test-image', content_type='image/png'),
        })
        with patch('starview_app.utils.validate_file_size'), patch('starview_app.utils.validate_image_file'), \
                patch('starview_app.services.badge_service.BadgeService.check_profile_complete_badge'), \
                patch('starview_app.views.views_user.safe_delete_file') as delete_file:
            with self.captureOnCommitCallbacks(execute=True):
                response = UserProfileViewSet().upload_picture(request)
                self.assertEqual(response.status_code, 200)
                self.assertNotEqual(UserProfile.objects.get(user=self.user).profile_picture.name, 'profile_pics/original.png')
                delete_file.assert_not_called()
            self.assertEqual(delete_file.call_args.args[0].name, 'profile_pics/original.png')

    def test_invalid_profile_text_returns_400_without_changes(self):
        for path, data in (
            ('update-name', {'first_name': None, 'last_name': 'Name'}),
            ('update-name', {'first_name': 'a' * 151, 'last_name': 'Name'}),
            ('update-username', {'new_username': ['bad']}),
            ('update-bio', {'bio': {'bad': 'value'}}),
            ('update-bio', {'bio': 'b' * 151}),
            ('update-unit-preference', {'unit_preference': 123}),
        ):
            with self.subTest(path=path, data_type=type(next(iter(data.values()))).__name__):
                response = self.client.patch(f'/api/users/me/{path}/', data, content_type='application/json')
                self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'profile-owner')
        self.assertEqual(self.user.userprofile.bio, '')
        with patch('starview_app.services.badge_service.BadgeService.check_profile_complete_badge'):
            accepted = self.client.patch('/api/users/me/update-bio/', {'bio': 'b' * 150}, content_type='application/json')
        self.assertEqual(accepted.status_code, 200)

    def test_profile_mutations_reject_non_object_json(self):
        for path in ('update-name', 'update-username', 'update-bio', 'update-unit-preference',
                     'update-language-preference', 'update-email', 'update-password'):
            for payload in ('[]', 'null'):
                with self.subTest(path=path, payload=payload):
                    response = self.client.patch(f'/api/users/me/{path}/', payload, content_type='application/json')
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(response.json()['error_code'], 'VALIDATION_ERROR')
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'profile-owner')
        self.assertEqual(self.user.email, 'profile@example.test')
        self.assertEqual(self.user.userprofile.bio, '')
        self.assertEqual(self.user.userprofile.language_preference, 'en')
        self.assertEqual(self.user.userprofile.unit_preference, 'metric')

    def test_language_preference_rejects_invalid_values_and_normalizes_valid_code(self):
        for language in (None, [], {}, 123, '', 'unsupported-language'):
            with self.subTest(language=language):
                response = self.client.patch('/api/users/me/update-language-preference/',
                                             {'language_preference': language}, content_type='application/json')
                self.assertEqual(response.status_code, 400)
                self.assertEqual(UserProfile.objects.get(user=self.user).language_preference, 'en')
        accepted = self.client.patch('/api/users/me/update-language-preference/',
                                     {'language_preference': ' ES '}, content_type='application/json')
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()['language_preference'], 'es')

    def test_private_profile_is_self_only_and_public_profiles_hide_security(self):
        mine = self.client.get('/api/users/me/')
        self.assertEqual(mine.json()['id'], self.user.pk)
        self.assertEqual(mine.json()['email'], self.user.email)
        self.assertIn('no-store', mine['Cache-Control'])
        public = self.client.get(f'/api/users/{self.other.username}/')
        for field in ('email', 'password', 'has_usable_password', 'unit_preference', 'language_preference', 'security_version', 'two_factor_enabled'):
            self.assertNotIn(field, public.json())
        for method in ('post', 'patch', 'put', 'delete'):
            response = getattr(self.client, method)(f'/api/users/{self.other.username}/', {}, content_type='application/json')
            self.assertEqual(response.status_code, 405)
        self.client.logout()
        denied = self.client.get('/api/users/me/')
        self.assertEqual(denied.status_code, 401)
        self.assertIn('no-store', denied['Cache-Control'])

    def test_revoked_session_loses_private_profile_and_personalized_public_state(self):
        Follow.objects.bulk_create([Follow(follower=self.user, following=self.other)])
        self.assertTrue(self.client.get(f'/api/users/{self.other.username}/').json()['is_following'])
        UserProfile.objects.filter(user=self.user).update(security_version=1)
        self.assertEqual(self.client.get('/api/users/me/').status_code, 401)
        self.assertIsNone(self.client.get(f'/api/users/{self.other.username}/').json()['is_following'])


class ProfileQueryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='query-owner')
        self.viewer = User.objects.create_user(username='query-viewer')
        self.request = SimpleNamespace(user=self.viewer)
        self.locations = Location.objects.bulk_create([
            Location(name=f'Profile location {index}', latitude=0, longitude=index, added_by=self.viewer)
            for index in range(10)
        ])
        self.reviews = Review.objects.bulk_create([
            Review(user=self.owner, location=location, rating=4, comment='Review')
            for location in self.locations
        ])
        review_type = ContentType.objects.get_for_model(Review)
        Vote.objects.bulk_create([
            Vote(user=self.viewer, content_type=review_type, object_id=self.reviews[0].pk, is_upvote=True),
            Vote(user=self.viewer, content_type=review_type, object_id=self.reviews[1].pk, is_upvote=False),
            # An unrelated content type with the same object ID must not count.
            Vote(user=self.viewer, content_type=ContentType.objects.get_for_model(User), object_id=self.reviews[0].pk, is_upvote=True),
        ])
        FavoriteLocation.objects.bulk_create([FavoriteLocation(user=self.owner, location=self.locations[0])])
        Follow.objects.bulk_create([Follow(follower=self.viewer, following=self.owner)])

    def test_batched_public_stats_preserve_values_and_query_count(self):
        expected = {'review_count': 10, 'locations_reviewed': 10, 'favorite_count': 1,
                    'helpful_votes_received': 1, 'follower_count': 1, 'following_count': 0}
        self.owner = User.objects.select_related('userprofile').get(pk=self.owner.pk)
        self.viewer = User.objects.select_related('userprofile').get(pk=self.viewer.pk)
        with CaptureQueriesContext(connection) as one:
            single = PublicUserSerializer([self.owner], many=True, context={'request': self.request}).data
        with CaptureQueriesContext(connection) as two:
            pair = PublicUserSerializer([self.owner, self.viewer], many=True, context={'request': self.request}).data
        self.assertEqual(pair[0]['stats'], expected)
        self.assertEqual(single[0], pair[0])
        self.assertTrue(pair[0]['is_following'])
        self.assertIsNone(pair[1]['is_following'])
        self.assertEqual(len(one), len(two))
        self.assertLessEqual(len(two), 7)

    def test_profile_review_page_queries_do_not_grow_per_review(self):
        # Warm ContentType so the comparison measures serializer-related queries.
        ContentType.objects.get_for_model(Review)
        with CaptureQueriesContext(connection) as many:
            response = self.client.get(f'/api/users/{self.owner.username}/reviews/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['results']), 10)
        first = next(row for row in response.json()['results'] if row['id'] == self.reviews[0].pk)
        self.assertEqual(first['upvote_count'], 1)
        Review.objects.filter(user=self.owner).exclude(pk=self.reviews[0].pk).delete()
        with CaptureQueriesContext(connection) as one:
            response = self.client.get(f'/api/users/{self.owner.username}/reviews/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(many), len(one))
        self.assertLessEqual(len(many), 6)

    def test_follow_pages_paginate_in_database_and_bound_stats_queries(self):
        users = [User.objects.create_user(username=f'follower-{index}') for index in range(21)]
        Follow.objects.bulk_create([Follow(follower=user, following=self.owner) for user in users])
        for path in (f'/api/users/{self.owner.username}/followers/', f'/api/users/{users[0].username}/following/'):
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertLessEqual(len(queries), 9)
            self.assertTrue(any('LIMIT ' in query['sql'] for query in queries))
        followers = self.client.get(f'/api/users/{self.owner.username}/followers/').json()
        self.assertEqual(followers['count'], 22)
        self.assertEqual(len(followers['results']), 20)
        self.assertIsNotNone(followers['next'])
        self.assertEqual(followers['results'][0]['username'], users[-1].username)


class ContentCacheBoundaryTests(SimpleTestCase):
    def test_production_clear_preserves_security_and_foreign_namespaces(self):
        backend = NamespacedRedisCache('redis://unused.example/1', {'KEY_PREFIX': 'starview'})
        stored = {
            b'starview:1:location:1', b'starview:1:allauth:rl:login:example',
            b'starview:1:allauth:mfa:replay:example', b'starview-security:1:throttle:login:example',
            b'another-app:1:content',
        }
        client = MagicMock()
        client.scan_iter.side_effect = lambda match, count: [key for key in stored if fnmatch(key.decode(), match)]
        client.delete.side_effect = lambda *keys: stored.difference_update(keys)
        with patch.object(backend._cache, 'get_client', return_value=client):
            self.assertTrue(backend.clear())
        self.assertNotIn(b'starview:1:location:1', stored)
        self.assertEqual(len(stored), 4)
        client.flushdb.assert_not_called()
        client.flushall.assert_not_called()
