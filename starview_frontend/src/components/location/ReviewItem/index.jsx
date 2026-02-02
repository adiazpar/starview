/* ReviewItem Component
 * Displays a single review with rating, content, photos, and vote buttons.
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Simple relative time formatter
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
}

function ReviewItem({ review, locationId }) {
  const { requireAuth } = useRequireAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: () => locationsApi.voteOnReview(locationId, review.id),
    onSuccess: () => {
      // Invalidate location query to refresh reviews
      queryClient.invalidateQueries({ queryKey: ['location', locationId] });
    },
    onError: () => {
      showToast('Failed to vote', 'error');
    },
  });

  const handleVote = useCallback(() => {
    if (!requireAuth()) return;
    voteMutation.mutate();
  }, [requireAuth, voteMutation]);

  // Format date
  const createdAt = formatRelativeTime(review.created_at);

  // Render stars
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <i
          key={i}
          className={`fa-${i <= rating ? 'solid' : 'regular'} fa-star`}
        />
      );
    }
    return stars;
  };

  // Check if comment is long
  const isLongComment = review.comment?.length > 300;
  const displayComment = expanded || !isLongComment
    ? review.comment
    : `${review.comment.slice(0, 300)}...`;

  return (
    <article className="review-item">
      {/* Header: User info and rating */}
      <header className="review-item__header">
        <Link
          to={`/users/${review.user}`}
          className="review-item__avatar"
          title={`@${review.user}`}
        >
          <img
            src={review.user_profile_picture}
            alt={review.user_full_name || review.user}
            loading="lazy"
          />
        </Link>
        <div className="review-item__user">
          {review.user_full_name ? (
            <>
              <span className="review-item__name">{review.user_full_name}</span>
              <div className="review-item__meta">
                <Link to={`/users/${review.user}`} className="review-item__username">
                  @{review.user}
                </Link>
                <span className="review-item__separator">·</span>
                <span className="review-item__date">{createdAt}</span>
                {review.is_edited && (
                  <>
                    <span className="review-item__separator">·</span>
                    <span className="review-item__edited">edited</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="review-item__meta">
              <Link to={`/users/${review.user}`} className="review-item__username review-item__username--primary">
                @{review.user}
              </Link>
              <span className="review-item__separator">·</span>
              <span className="review-item__date">{createdAt}</span>
              {review.is_edited && (
                <>
                  <span className="review-item__separator">·</span>
                  <span className="review-item__edited">edited</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="review-item__rating">
          {renderStars(review.rating)}
        </div>
      </header>

      {/* Comment */}
      {review.comment && (
        <div className="review-item__content">
          <p className="review-item__comment">{displayComment}</p>
          {isLongComment && (
            <button
              className="review-item__expand"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* Photos */}
      {review.photos?.length > 0 && (
        <div className="review-item__photos">
          {review.photos.slice(0, 4).map((photo) => (
            <div key={photo.id} className="review-item__photo">
              <img
                src={photo.thumbnail_url || photo.image_url}
                alt={photo.caption || 'Review photo'}
                loading="lazy"
              />
            </div>
          ))}
          {review.photos.length > 4 && (
            <div className="review-item__photo review-item__photo--more">
              +{review.photos.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Actions: Votes */}
      <footer className="review-item__footer">
        <button
          className={`review-item__vote ${review.user_vote === 'up' ? 'review-item__vote--active' : ''}`}
          onClick={handleVote}
          disabled={voteMutation.isPending}
          aria-label="Upvote review"
        >
          <i className="fa-solid fa-thumbs-up"></i>
          <span>{review.upvote_count || 0}</span>
        </button>
      </footer>
    </article>
  );
}

export default ReviewItem;
