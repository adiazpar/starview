/* PhotoLightbox Component
 * Shared lightbox modal for displaying photos with attribution and voting.
 * Used by PhotoMosaic and LocationGallery.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './PhotoLightbox.css';

// Format upload date as "Jan 2024" or similar
function formatUploadDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function PhotoLightbox({
  photo,
  locationName,
  isClosing,
  onClose,
  onVote,
  isVoting = false,
}) {
  const lightboxRef = useRef(null);

  // Handle keyboard escape to close lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus lightbox when opened for accessibility
  useEffect(() => {
    if (lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, []);

  const handleVoteClick = useCallback((e) => {
    e.stopPropagation();
    if (isVoting) return;
    onVote(photo.id);
  }, [onVote, photo.id, isVoting]);

  if (!photo) return null;

  return (
    <div
      ref={lightboxRef}
      className={`photo-lightbox ${isClosing ? 'photo-lightbox--closing' : ''}`}
      onClick={onClose}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
    >
      {/* Image container with overlay bars */}
      <div className="photo-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.full || photo.thumbnail}
          alt={locationName ? `${locationName} photo` : 'Photo'}
        />

        {/* Top Bar - date and close button */}
        <div className="photo-lightbox__bar photo-lightbox__bar--top">
          {photo.uploaded_at && (
            <div className="photo-lightbox__date">
              <span className="photo-lightbox__date-label">Uploaded</span>
              <span className="photo-lightbox__date-value">{formatUploadDate(photo.uploaded_at)}</span>
            </div>
          )}
          <button
            className="photo-lightbox__action photo-lightbox__action--close"
            onClick={onClose}
            aria-label="Close lightbox"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Bottom Bar - attribution and vote button */}
        <div className="photo-lightbox__bar photo-lightbox__bar--bottom">
          {photo.uploaded_by && (
            photo.uploaded_by.is_system_account ? (
              <div className="photo-lightbox__attribution">
                <img
                  src={photo.uploaded_by.profile_picture}
                  alt=""
                  className="photo-lightbox__avatar"
                />
                <div className="photo-lightbox__user-info">
                  <span className="photo-lightbox__username">@{photo.uploaded_by.username}</span>
                  <span className="photo-lightbox__display-name">{photo.uploaded_by.display_name}</span>
                </div>
              </div>
            ) : (
              <Link
                to={`/profile/${photo.uploaded_by.username}`}
                className="photo-lightbox__attribution"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={photo.uploaded_by.profile_picture}
                  alt=""
                  className="photo-lightbox__avatar"
                />
                <div className="photo-lightbox__user-info">
                  <span className="photo-lightbox__username">@{photo.uploaded_by.username}</span>
                  <span className="photo-lightbox__display-name">{photo.uploaded_by.display_name}</span>
                </div>
              </Link>
            )
          )}
          {onVote && (
            <button
              className={`photo-lightbox__action photo-lightbox__action--vote ${photo.user_has_upvoted ? 'photo-lightbox__action--active' : ''}`}
              onClick={handleVoteClick}
              disabled={isVoting}
              aria-label={photo.user_has_upvoted ? 'Remove upvote' : 'Upvote photo'}
            >
              <i className={`fa-${photo.user_has_upvoted ? 'solid' : 'regular'} fa-thumbs-up`}></i>
              {photo.upvote_count > 0 && (
                <span className="photo-lightbox__vote-count">{photo.upvote_count}</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PhotoLightbox;
