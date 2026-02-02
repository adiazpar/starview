/* SummaryCard Component
 * AI-generated review summary card with avatar stack and feedback.
 * Used in LocationHighlights section on desktop.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Get initials from username (e.g., "test_reviewer" -> "TR")
function getInitials(username) {
  if (!username) return '?';
  const parts = username.replace(/[_-]/g, ' ').split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

// Generate consistent color from username
function getAvatarColor(username) {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function SummaryCard({ location }) {
  const { requireAuth } = useRequireAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const rating = parseFloat(location.average_rating) || 0;
  const reviewCount = location.review_count || 0;
  const reviews = location.reviews || [];
  const reviewSummary = location.review_summary || null;

  // Initialize feedback state from server
  const [feedbackGiven, setFeedbackGiven] = useState(
    location.user_summary_feedback || null
  );

  // Get unique reviewers for avatar stack (max 3)
  const reviewers = reviews
    .slice(0, 3)
    .map((review) => ({
      username: review.user,
      initials: getInitials(review.user),
      color: getAvatarColor(review.user),
    }));

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: (isHelpful) => locationsApi.submitSummaryFeedback(location.id, isHelpful),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      setFeedbackGiven(location.user_summary_feedback || null);
      showToast('Failed to submit feedback', 'error');
    },
  });

  // Handle feedback click
  const handleFeedback = useCallback(
    (isHelpful) => {
      if (!requireAuth()) return;
      setFeedbackGiven(isHelpful ? 'yes' : 'no');
      feedbackMutation.mutate(isHelpful);
    },
    [requireAuth, feedbackMutation]
  );

  // Smooth scroll to reviews section (accounting for navbar and sticky toolbar)
  const handleShowReviews = useCallback(() => {
    const reviewsSection = document.getElementById('reviews-section');
    if (reviewsSection) {
      const styles = getComputedStyle(document.documentElement);
      const navbarHeight = parseInt(styles.getPropertyValue('--navbar-total-height') || '72', 10);
      const spaceXl = parseInt(styles.getPropertyValue('--space-xl') || '32', 10);
      // Match the sticky top offset: calc(var(--navbar-total-height) * 2 + var(--space-xl))
      const stickyOffset = navbarHeight * 2 + spaceXl;
      const top = reviewsSection.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  // Don't render if no summary
  if (!reviewSummary) return null;

  return (
    <div className="summary-card glass-card">
      {/* Header with title */}
      <h3 className="summary-card__title">Stargazers are saying</h3>

      {/* Rating display */}
      <div className="summary-card__rating">
        <span className="summary-card__rating-number">{rating.toFixed(1)}</span>
        <i className="fa-solid fa-star summary-card__rating-star"></i>
      </div>

      {/* Summary Text */}
      <p className="summary-card__text">{reviewSummary}</p>

      {/* AI Disclaimer */}
      <p className="summary-card__disclaimer">
        This summary is AI-generated from reviews and may not always be accurate.
      </p>

      {/* Avatar Stack */}
      <div className="summary-card__avatars">
        {reviewers.map((reviewer, index) => (
          <div
            key={reviewer.username}
            className="summary-card__avatar"
            style={{
              backgroundColor: reviewer.color,
              zIndex: reviewers.length - index,
            }}
            title={`@${reviewer.username}`}
          >
            {reviewer.initials}
          </div>
        ))}
      </div>

      {/* Show all reviews button */}
      <button type="button" className="summary-card__link" onClick={handleShowReviews}>
        Show all {reviewCount} reviews
      </button>

      {/* Feedback Section */}
      <div className="summary-card__feedback">
        <span className="summary-card__feedback-prompt">
          {feedbackGiven ? 'Thanks! Change your answer?' : 'Was this helpful?'}
        </span>
        <button
          type="button"
          className={`summary-card__feedback-link ${feedbackGiven === 'yes' ? 'summary-card__feedback-link--selected' : ''}`}
          onClick={() => handleFeedback(true)}
        >
          Yes
        </button>
        <span className="summary-card__feedback-divider">|</span>
        <button
          type="button"
          className={`summary-card__feedback-link ${feedbackGiven === 'no' ? 'summary-card__feedback-link--selected' : ''}`}
          onClick={() => handleFeedback(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default SummaryCard;
