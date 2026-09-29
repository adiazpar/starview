/* ReviewsPanel Component
 * Unified reviews section with rating metrics, AI summary, and review list.
 * Two-column layout on desktop (sticky metrics + scrollable reviews).
 * Mobile-first stacked approach.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ReviewItem from '../ReviewItem';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Sort options for reviews
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
];

function ReviewsPanel({ location }) {
  const { requireAuth } = useRequireAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const reviewCount = location.review_count || 0;

  // Initialize feedback state from server (persists across page refreshes)
  const [feedbackGiven, setFeedbackGiven] = useState(
    location.user_summary_feedback || null
  ); // 'yes' | 'no' | null

  // Toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortValue, setSortValue] = useState('newest');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef(null);

  const rating = parseFloat(location.average_rating) || 0;
  const reviews = location.reviews || [];
  const reviewSummary = location.review_summary || null;

  // Close sort dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target)) {
        setSortDropdownOpen(false);
      }
    }
    if (sortDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [sortDropdownOpen]);

  // Filter and sort reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    // Filter by search query (searches review text and username)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (review) =>
          review.comment?.toLowerCase().includes(query) ||
          review.user?.toLowerCase().includes(query)
      );
    }

    // Sort reviews
    result.sort((a, b) => {
      switch (sortValue) {
        case 'oldest':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'highest':
          return b.rating - a.rating;
        case 'lowest':
          return a.rating - b.rating;
        case 'newest':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return result;
  }, [reviews, searchQuery, sortValue]);

  // Handle sort change
  const handleSortChange = useCallback((value) => {
    setSortValue(value);
    setSortDropdownOpen(false);
  }, []);

  // Handle search clear
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Handle filter button click (placeholder for future filter modal)
  const handleFilterClick = useCallback(() => {
    showToast('Filters coming soon', 'info');
  }, [showToast]);

  const currentSortLabel = SORT_OPTIONS.find((opt) => opt.value === sortValue)?.label || 'Newest';

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
      profilePicture: review.user_profile_picture,
      fullName: review.user_full_name,
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
                    style={{ zIndex: reviewers.length - index }}
                    title={`@${reviewer.username}`}
                  >
                    <img
                      src={reviewer.profilePicture}
                      alt={reviewer.fullName || reviewer.username}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              <p className="reviews-panel__summary-text">{reviewSummary}</p>

              <p className="reviews-panel__disclaimer">
                <svg
                  className="reviews-panel__ai-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 375 375"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <defs>
                    <clipPath id="ai-star-clip">
                      <path d="M 167.78125 167.78125 L 207.53125 167.78125 L 207.53125 207.53125 L 167.78125 207.53125 Z" />
                    </clipPath>
                  </defs>
                  <path
                    fill="currentColor"
                    d="M 375.007812 187.507812 C 243.507812 218.441406 218.433594 243.515625 187.5 375.015625 C 156.574219 243.507812 131.5 218.433594 0 187.507812 C 131.5 156.574219 156.574219 131.5 187.507812 0 C 218.433594 131.5 243.507812 156.574219 375.007812 187.507812 Z"
                  />
                  <g clipPath="url(#ai-star-clip)">
                    <path
                      fill="currentColor"
                      d="M 207.21875 187.5 C 193.390625 190.753906 190.753906 193.390625 187.5 207.21875 C 184.246094 193.390625 181.609375 190.753906 167.78125 187.5 C 181.609375 184.246094 184.246094 181.609375 187.5 167.78125 C 190.753906 181.609375 193.390625 184.246094 207.21875 187.5 Z"
                    />
                  </g>
                </svg>
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

          {/* Toolbar - Search, Filter, Sort */}
          {reviewCount > 0 && (
            <div className="reviews-panel__toolbar">
              {/* Search Input */}
              <div className="reviews-panel__search">
                <i className="fa-solid fa-magnifying-glass reviews-panel__search-icon"></i>
                <input
                  type="text"
                  className="reviews-panel__search-input"
                  placeholder="Search reviews..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="reviews-panel__search-clear"
                    onClick={handleSearchClear}
                    aria-label="Clear search"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>

              {/* Filter Button */}
              <button
                type="button"
                className="reviews-panel__filter-btn"
                onClick={handleFilterClick}
                aria-label="Filter reviews"
              >
                <i className="fa-solid fa-sliders"></i>
              </button>

              {/* Sort Dropdown */}
              <div className="reviews-panel__sort" ref={sortDropdownRef}>
                <button
                  type="button"
                  className="reviews-panel__sort-trigger"
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                  aria-expanded={sortDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <i className="fa-solid fa-arrow-down-wide-short"></i>
                  <span>{currentSortLabel}</span>
                  <i className={`fa-solid fa-chevron-down reviews-panel__sort-chevron ${sortDropdownOpen ? 'reviews-panel__sort-chevron--open' : ''}`}></i>
                </button>

                {sortDropdownOpen && (
                  <ul className="reviews-panel__sort-menu" role="listbox">
                    {SORT_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          className={`reviews-panel__sort-option ${sortValue === option.value ? 'reviews-panel__sort-option--active' : ''}`}
                          onClick={() => handleSortChange(option.value)}
                          role="option"
                          aria-selected={sortValue === option.value}
                        >
                          {option.label}
                          {sortValue === option.value && (
                            <i className="fa-solid fa-check reviews-panel__sort-check"></i>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
            <>
              <div className="reviews-panel__items">
                {filteredReviews.slice(0, 4).map((review) => (
                  <ReviewItem
                    key={review.id}
                    review={review}
                    locationId={location.id}
                  />
                ))}
              </div>

              {/* Show all button - only if more than 4 reviews */}
              {filteredReviews.length > 4 && (
                <button className="reviews-panel__show-all">
                  Show all {filteredReviews.length} reviews
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default ReviewsPanel;
