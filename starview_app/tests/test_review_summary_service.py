from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from starview_app.services.review_summary_service import ReviewSummaryService


@override_settings(GEMINI_API_KEY='test-only-key', GEMINI_MODEL='test-model')
class ReviewSummaryTests(SimpleTestCase):
    def test_genai_client_uses_configured_model_and_persists_summary(self):
        location = MagicMock(pk=1, name='Test site')
        location.reviews.count.return_value = 3
        with patch('google.genai.Client') as client, patch.object(ReviewSummaryService, '_build_prompt', return_value='Test prompt'):
            generate = client.return_value.__enter__.return_value.models.generate_content
            generate.return_value.text = '  Clear horizons.  '
            self.assertTrue(ReviewSummaryService.generate_summary(location))
            generate.assert_called_once_with(model='test-model', contents='Test prompt')
        self.assertEqual(location.review_summary, 'Clear horizons.')
        self.assertFalse(location.review_summary_stale)
        location.save.assert_called_once()

    def test_sdk_failure_keeps_existing_summary(self):
        location = MagicMock(pk=1, name='Test site', review_summary='Existing summary')
        location.reviews.count.return_value = 3
        with patch('google.genai.Client', side_effect=RuntimeError('test failure')), patch.object(ReviewSummaryService, '_build_prompt', return_value='Test prompt'):
            self.assertFalse(ReviewSummaryService.generate_summary(location))
        self.assertEqual(location.review_summary, 'Existing summary')
        location.save.assert_not_called()
