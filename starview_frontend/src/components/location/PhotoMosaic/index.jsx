/* PhotoMosaic Component
 * Asymmetric photo grid that feels editorial, not generic carousel.
 * Click to open lightbox. Hover shows photographer attribution.
 * Photos sorted by upvotes - users can vote in lightbox.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { usePhotoVote } from '../../../hooks/usePhotoVote';
import './styles.css';

// Format upload date as "Jan 2024" or similar
function formatUploadDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function PhotoMosaic({ images, locationName, locationId, photoCount }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const lightboxRef = useRef(null);
  const { requireAuth } = useRequireAuth();
  const { mutate: toggleVote, isPending: isVoting } = usePhotoVote(locationId);

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    setIsClosing(false);
  }, []);

  const closeLightbox = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    // Wait for fade-out animation to complete
    setTimeout(() => {
      setLightboxIndex(null);
      setIsClosing(false);
      // Clear any lingering hover/focus state on mobile
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 200); // Match --animation-duration (0.2s)
  }, [isClosing]);

  const handleVote = useCallback((e, photoId) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    if (isVoting) return;
    toggleVote(photoId);
  }, [requireAuth, isVoting, toggleVote]);

  // Handle keyboard escape to close lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, closeLightbox]);

  // Focus lightbox when opened for accessibility
  useEffect(() => {
    if (lightboxIndex !== null && lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, [lightboxIndex]);

  if (!images || images.length === 0) return null;

  // Show up to 5 images in mosaic, rest in lightbox
  const visibleImages = images.slice(0, 5);
  // Use photoCount prop for total count, fallback to images.length
  const totalCount = photoCount ?? images.length;
  const remainingCount = totalCount - visibleImages.length;

  const currentImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  // Format photo count with threshold (show "99+" for 100+ photos)
  const PHOTO_COUNT_THRESHOLD = 99;
  const photoCountDisplay = totalCount > PHOTO_COUNT_THRESHOLD
    ? `${PHOTO_COUNT_THRESHOLD}+`
    : totalCount;

  return (
    <div className="photo-mosaic">
      {/* Section Header */}
      <div className="photo-mosaic__header">
        <span>Photos ({photoCountDisplay})</span>
      </div>

      {/* Mosaic Grid */}
      <div className={`photo-mosaic__grid photo-mosaic__grid--${Math.min(visibleImages.length, 5)}`}>
        {visibleImages.map((image, index) => (
          <button
            key={image.id}
            className={`photo-mosaic__item photo-mosaic__item--${index + 1}`}
            onClick={() => openLightbox(index)}
            aria-label={`View photo ${index + 1} of ${totalCount}${image.uploaded_by ? ` by ${image.uploaded_by.display_name}` : ''}`}
          >
            <img
              src={image.full || image.thumbnail}
              alt={`${locationName} photo ${index + 1}`}
              loading="lazy"
            />

            {/* Hover Overlay with User Attribution */}
            {image.uploaded_by && (
              <div className="photo-mosaic__overlay">
                <div className="photo-mosaic__attribution">
                  <img
                    src={image.uploaded_by.profile_picture}
                    alt=""
                    className="photo-mosaic__avatar"
                  />
                  <div className="photo-mosaic__user-info">
                    <span className="photo-mosaic__username">@{image.uploaded_by.username}</span>
                    <span className="photo-mosaic__display-name">{image.uploaded_by.display_name}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Show remaining count on last visible image */}
            {index === visibleImages.length - 1 && remainingCount > 0 && (
              <div className="photo-mosaic__more">
                <span>+{remainingCount}</span>
              </div>
            )}
          </button>
        ))}

        {/* See All Photos Card (Mobile only) */}
        <Link to={`/locations/${locationId}/photos`} className="photo-mosaic__item photo-mosaic__item--see-all">
          <span>See all photos</span>
        </Link>
      </div>

      {/* See All Photos Link (Desktop only) */}
      <div className="photo-mosaic__footer">
        <Link to={`/locations/${locationId}/photos`} className="photo-mosaic__link">
          See all photos
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && currentImage && (
        <div
          ref={lightboxRef}
          className={`photo-mosaic__lightbox ${isClosing ? 'photo-mosaic__lightbox--closing' : ''}`}
          onClick={closeLightbox}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
        >
          {/* Image container with overlay bars */}
          <div className="photo-mosaic__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentImage.full || currentImage.thumbnail}
              alt={`${locationName} photo ${lightboxIndex + 1}`}
            />

            {/* Top Bar - date and close button */}
            <div className="photo-mosaic__lightbox-bar photo-mosaic__lightbox-bar--top">
              {currentImage.uploaded_at && (
                <div className="photo-mosaic__date">
                  <span className="photo-mosaic__date-label">Uploaded</span>
                  <span className="photo-mosaic__date-value">{formatUploadDate(currentImage.uploaded_at)}</span>
                </div>
              )}
              <button
                className="photo-mosaic__action photo-mosaic__action--close"
                onClick={closeLightbox}
                aria-label="Close lightbox"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Bottom Bar - attribution and vote button */}
            <div className="photo-mosaic__lightbox-bar photo-mosaic__lightbox-bar--bottom">
              {currentImage.uploaded_by && (
                currentImage.uploaded_by.is_system_account ? (
                  <div className="photo-mosaic__attribution">
                    <img
                      src={currentImage.uploaded_by.profile_picture}
                      alt=""
                      className="photo-mosaic__avatar"
                    />
                    <div className="photo-mosaic__user-info">
                      <span className="photo-mosaic__username">@{currentImage.uploaded_by.username}</span>
                      <span className="photo-mosaic__display-name">{currentImage.uploaded_by.display_name}</span>
                    </div>
                  </div>
                ) : (
                  <Link
                    to={`/profile/${currentImage.uploaded_by.username}`}
                    className="photo-mosaic__attribution"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={currentImage.uploaded_by.profile_picture}
                      alt=""
                      className="photo-mosaic__avatar"
                    />
                    <div className="photo-mosaic__user-info">
                      <span className="photo-mosaic__username">@{currentImage.uploaded_by.username}</span>
                      <span className="photo-mosaic__display-name">{currentImage.uploaded_by.display_name}</span>
                    </div>
                  </Link>
                )
              )}
              {locationId && (
                <button
                  className={`photo-mosaic__action photo-mosaic__action--vote ${currentImage.user_has_upvoted ? 'photo-mosaic__action--active' : ''}`}
                  onClick={(e) => handleVote(e, currentImage.id)}
                  aria-label={currentImage.user_has_upvoted ? 'Remove upvote' : 'Upvote photo'}
                >
                  <i className={`fa-${currentImage.user_has_upvoted ? 'solid' : 'regular'} fa-thumbs-up`}></i>
                  {currentImage.upvote_count > 0 && (
                    <span className="photo-mosaic__vote-count">{currentImage.upvote_count}</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoMosaic;
