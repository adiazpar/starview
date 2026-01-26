/* PhotoMosaic Component
 * Asymmetric photo grid that feels editorial, not generic carousel.
 * Click to open lightbox. Hover shows photographer attribution.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './styles.css';

function PhotoMosaic({ images, locationName }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const lightboxRef = useRef(null);

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    // Clear any lingering hover/focus state on mobile
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

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

            {/* Hover Overlay with User Attribution - matches mosaic overlay */}
            {currentImage.uploaded_by && (
              <div className="photo-mosaic__overlay">
                {currentImage.uploaded_by.is_system_account ? (
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
                )}
              </div>
            )}

            {/* Close button */}
            <button
              className="photo-mosaic__lightbox-close"
              onClick={closeLightbox}
              aria-label="Close lightbox"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoMosaic;
