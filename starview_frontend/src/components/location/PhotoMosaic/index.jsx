/* PhotoMosaic Component
 * Asymmetric photo grid that feels editorial, not generic carousel.
 * Click to open lightbox. Hover shows photographer attribution.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './styles.css';

// Format date for display
function formatUploadDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function PhotoMosaic({ images, locationName }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const lightboxRef = useRef(null);

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    document.body.style.overflow = '';
    // Clear any lingering hover/focus state on mobile
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const navigateLightbox = useCallback((direction) => {
    setLightboxIndex((prev) => {
      const newIndex = prev + direction;
      if (newIndex < 0) return images.length - 1;
      if (newIndex >= images.length) return 0;
      return newIndex;
    });
  }, [images.length]);

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigateLightbox(-1);
      if (e.key === 'ArrowRight') navigateLightbox(1);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, closeLightbox, navigateLightbox]);

  // Focus lightbox when opened for accessibility
  useEffect(() => {
    if (lightboxIndex !== null && lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, [lightboxIndex]);

  if (!images || images.length === 0) return null;

  // Show up to 5 images in mosaic, rest in lightbox
  const visibleImages = images.slice(0, 5);
  const remainingCount = images.length - 5;

  const currentImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  return (
    <div className="photo-mosaic">
      {/* Mosaic Grid */}
      <div className={`photo-mosaic__grid photo-mosaic__grid--${Math.min(visibleImages.length, 5)}`}>
        {visibleImages.map((image, index) => (
          <button
            key={image.id}
            className={`photo-mosaic__item photo-mosaic__item--${index + 1}`}
            onClick={() => openLightbox(index)}
            aria-label={`View photo ${index + 1} of ${images.length}${image.uploaded_by ? ` by ${image.uploaded_by.display_name}` : ''}`}
          >
            <img
              src={image.thumbnail || image.full}
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
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && currentImage && (
        <div
          ref={lightboxRef}
          className="photo-mosaic__lightbox"
          onClick={closeLightbox}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
        >
          <div className="photo-mosaic__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentImage.full || currentImage.thumbnail}
              alt={`${locationName} photo ${lightboxIndex + 1}`}
            />

            {/* Navigation */}
            {images.length > 1 && (
              <>
                <button
                  className="photo-mosaic__lightbox-nav photo-mosaic__lightbox-nav--prev"
                  onClick={() => navigateLightbox(-1)}
                  aria-label="Previous photo"
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button
                  className="photo-mosaic__lightbox-nav photo-mosaic__lightbox-nav--next"
                  onClick={() => navigateLightbox(1)}
                  aria-label="Next photo"
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </>
            )}
          </div>

          {/* Bottom Bar with Attribution */}
          <div className="photo-mosaic__lightbox-bar">
            {currentImage.uploaded_by ? (
              <Link
                to={`/profile/${currentImage.uploaded_by.username}`}
                className="photo-mosaic__lightbox-attribution"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={currentImage.uploaded_by.profile_picture}
                  alt=""
                  className="photo-mosaic__lightbox-avatar"
                />
                <div className="photo-mosaic__lightbox-user">
                  <span className="photo-mosaic__lightbox-username">@{currentImage.uploaded_by.username}</span>
                  <span className="photo-mosaic__lightbox-name">{currentImage.uploaded_by.display_name}</span>
                </div>
              </Link>
            ) : (
              <div className="photo-mosaic__lightbox-attribution">
                <span className="photo-mosaic__lightbox-name">Unknown photographer</span>
              </div>
            )}

            <div className="photo-mosaic__lightbox-meta">
              {currentImage.uploaded_at && (
                <span className="photo-mosaic__lightbox-date">{formatUploadDate(currentImage.uploaded_at)}</span>
              )}
              <span className="photo-mosaic__lightbox-counter">
                {lightboxIndex + 1} / {images.length}
              </span>
            </div>
          </div>

          {/* Close button */}
          <button
            className="photo-mosaic__lightbox-close"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}
    </div>
  );
}

export default PhotoMosaic;
