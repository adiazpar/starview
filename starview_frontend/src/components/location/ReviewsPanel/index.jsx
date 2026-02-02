/* ReviewsPanel Component
 * Unified reviews section with rating metrics, AI summary, and review list.
 * Two-column layout on desktop (sticky metrics + scrollable reviews).
 * Mobile-first stacked approach.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ReviewItem from '../ReviewItem';
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

function ReviewsPanel({ location }) {
  const { requireAuth } = useRequireAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const reviewCount = location.review_count || 0;

  // Initialize feedback state from server (persists across page refreshes)
  const [feedbackGiven, setFeedbackGiven] = useState(
    location.user_summary_feedback || null
  ); // 'yes' | 'no' | null

  const rating = parseFloat(location.average_rating) || 0;
  const reviews = location.reviews || [];
  const reviewSummary = location.review_summary || null;

  // Calculate rating distribution from reviews
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((review) => {
    const r = Math.round(review.rating);
    if (r >= 1 && r <= 5) {
      distribution[r]++;
    }
  });

  // Find max for scaling bars
  const maxCount = Math.max(...Object.values(distribution), 1);

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
      // Invalidate location query to refresh feedback state
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      // Revert optimistic update on error
      setFeedbackGiven(location.user_summary_feedback || null);
      showToast('Failed to submit feedback', 'error');
    },
  });

  // Handle feedback click
  const handleFeedback = useCallback(
    (isHelpful) => {
      if (!requireAuth()) return;
      // Optimistic update
      setFeedbackGiven(isHelpful ? 'yes' : 'no');
      feedbackMutation.mutate(isHelpful);
    },
    [requireAuth, feedbackMutation]
  );

  return (
    <section id="reviews-section" className="reviews-panel">
      <div className="reviews-panel__section-header">
        <span>Reviews</span>
      </div>

      <div className="reviews-panel__content">
        {/* Left: Rating Metrics (sticky on desktop) */}
        <aside className="reviews-panel__metrics">
          <div className={`reviews-panel__rating ${reviewCount === 0 ? 'reviews-panel__rating--empty' : ''}`}>
            <span className="reviews-panel__rating-number">{rating.toFixed(1)}</span>
            <i className={`${reviewCount === 0 ? 'fa-regular' : 'fa-solid'} fa-star reviews-panel__rating-star`}></i>
          </div>

          <a href="#reviews-list" className="reviews-panel__count">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </a>

          <div className="reviews-panel__distribution">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = distribution[stars];
              const percentage = (count / maxCount) * 100;

              return (
                <div key={stars} className="reviews-panel__bar-row">
                  <span className="reviews-panel__bar-label">
                    {stars}
                    <i className="fa-solid fa-star"></i>
                  </span>
                  <div className="reviews-panel__bar-track">
                    <div
                      className="reviews-panel__bar-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button className="reviews-panel__cta" disabled>
            Write a Review
          </button>
        </aside>

        {/* Right: Reviews List */}
        <div id="reviews-list" className="reviews-panel__list">
          {/* AI Summary Card - mobile only */}
          {reviewSummary && (
            <div className="reviews-panel__summary glass-card">
              <h3 className="reviews-panel__summary-title">Stargazers are saying</h3>

              <div className="reviews-panel__avatars">
                {reviewers.map((reviewer, index) => (
                  <div
                    key={reviewer.username}
                    className="reviews-panel__avatar"
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

              <p className="reviews-panel__summary-text">{reviewSummary}</p>

              <p className="reviews-panel__disclaimer">
                This summary is AI-generated from reviews and may not always be accurate.
              </p>

              <div className="reviews-panel__feedback">
                <span className="reviews-panel__feedback-prompt">
                  {feedbackGiven ? 'Thanks! Change your answer?' : 'Was this helpful?'}
                </span>
                <button
                  type="button"
                  className={`reviews-panel__feedback-link ${feedbackGiven === 'yes' ? 'reviews-panel__feedback-link--selected' : ''}`}
                  onClick={() => handleFeedback(true)}
                >
                  Yes
                </button>
                <span className="reviews-panel__feedback-divider">|</span>
                <button
                  type="button"
                  className={`reviews-panel__feedback-link ${feedbackGiven === 'no' ? 'reviews-panel__feedback-link--selected' : ''}`}
                  onClick={() => handleFeedback(false)}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Reviews list or empty state */}
          {reviewCount === 0 ? (
            <div className="reviews-panel__empty">
              <i className="fa-regular fa-message"></i>
              <h3>No reviews yet</h3>
              <p>Be the first to share your experience at {location.name}</p>
            </div>
          ) : (
            <div className="reviews-panel__items">
              {reviews.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  locationId={location.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default ReviewsPanel;
