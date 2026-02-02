/* ReviewItem Component
 * Displays a single review with rating, content, photos, and vote buttons.
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useAuth } from '../../../contexts/AuthContext';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import { usePhotoVote } from '../../../hooks/usePhotoVote';
import { PhotoLightbox } from '../../shared/photo';
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const { mutate: togglePhotoVote, isPending: isVotingPhoto } = usePhotoVote(locationId);

  // Vote mutation with optimistic updates
  const voteMutation = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const response = await locationsApi.voteOnReview(locationId, review.id);
      return {
        reviewId: review.id,
        upvotes: response.data.upvotes,
        user_vote: response.data.user_vote,
      };
    },

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    onMutate: async () => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      const locationIdStr = String(locationId);
      await queryClient.cancelQueries({ queryKey: ['location', locationIdStr] });

      // Snapshot previous location data for rollback
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);

      // Optimistically update the review in the location cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], {
          ...previousLocation,
          reviews: previousLocation.reviews?.map((r) =>
            r.id === review.id
              ? {
                  ...r,
                  // Toggle: if already voted up, remove vote; otherwise add vote
                  user_vote: r.user_vote === 'up' ? null : 'up',
                  upvote_count: r.user_vote === 'up'
                    ? (r.upvote_count || 1) - 1
                    : (r.upvote_count || 0) + 1,
                }
              : r
          ),
        });
      }

      return { previousLocation, locationIdStr };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, variables, context) => {
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', context.locationIdStr], context.previousLocation);
      }
      showToast('Failed to vote', 'error');
    },

    // VALIDATE: Ensure cache matches server state
    onSuccess: ({ reviewId, upvotes, user_vote }) => {
      const locationIdStr = String(locationId);
      queryClient.setQueryData(['location', locationIdStr], (old) => {
        if (!old) return old;
        return {
          ...old,
          reviews: old.reviews?.map((r) =>
            r.id === reviewId
              ? { ...r, upvote_count: upvotes, user_vote }
              : r
          ),
        };
      });
    },
  });

  const handleVote = useCallback(() => {
    if (!requireAuth()) return;
    voteMutation.mutate();
  }, [requireAuth, voteMutation]);

  // Lightbox handlers
  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    setIsClosing(false);
  }, []);

  const closeLightbox = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setLightboxIndex(null);
      setIsClosing(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 200);
  }, [isClosing]);

  // Handle photo vote
  const handlePhotoVote = useCallback((photoId) => {
    if (!requireAuth()) return;
    if (isVotingPhoto) return;
    togglePhotoVote(photoId);
  }, [requireAuth, isVotingPhoto, togglePhotoVote]);

  // Transform review photos to lightbox format
  const lightboxPhotos = review.photos?.map((photo) => ({
    id: photo.id,
    thumbnail: photo.thumbnail_url,
    full: photo.image_url,
    upvote_count: photo.upvote_count,
    user_has_upvoted: photo.user_has_upvoted,
    uploaded_by: {
      username: review.user,
      display_name: review.user_full_name || review.user,
      profile_picture: review.user_profile_picture,
    },
  })) || [];

  const currentPhoto = lightboxIndex !== null ? lightboxPhotos[lightboxIndex] : null;

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
          {review.photos.map((photo, index) => (
            <button
              key={photo.id}
              className="review-item__photo"
              onClick={() => openLightbox(index)}
              aria-label={`View photo ${index + 1} of ${review.photos.length}`}
            >
              <img
                src={photo.thumbnail_url || photo.image_url}
                alt={photo.caption || 'Review photo'}
                loading="lazy"
              />
            </button>
          ))}
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
          <i className={`${review.user_vote === 'up' ? 'fa-solid' : 'fa-regular'} fa-thumbs-up`}></i>
          <span>{review.upvote_count || 0}</span>
        </button>
      </footer>

      {/* Photo Lightbox */}
      {lightboxIndex !== null && currentPhoto && (
        <PhotoLightbox
          photo={currentPhoto}
          locationName=""
          isClosing={isClosing}
          onClose={closeLightbox}
          onVote={handlePhotoVote}
          isVoting={isVotingPhoto}
          isOwnPhoto={user?.username === review.user}
        />
      )}
    </article>
  );
}

export default ReviewItem;
