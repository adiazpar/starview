/* PhotoMosaic Component
 * Asymmetric photo grid that feels editorial, not generic carousel.
 * Click to open lightbox.
 */

import { useState, useCallback } from 'react';
import './styles.css';

function PhotoMosaic({ images, locationName }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    document.body.style.overflow = '';
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
  const handleKeyDown = useCallback((e) => {
    if (lightboxIndex === null) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  }, [lightboxIndex, closeLightbox, navigateLightbox]);

  if (!images || images.length === 0) return null;

  // Show up to 5 images in mosaic, rest in lightbox
  const visibleImages = images.slice(0, 5);
  const remainingCount = images.length - 5;

  return (
    <section className="photo-mosaic glass-card">
      <div className="photo-mosaic__header">
        <span>Photos ({images.length})</span>
      </div>

      {/* Mosaic Grid */}
      <div className={`photo-mosaic__grid photo-mosaic__grid--${Math.min(visibleImages.length, 5)}`}>
        {visibleImages.map((image, index) => (
          <button
            key={image.id}
            className={`photo-mosaic__item photo-mosaic__item--${index + 1}`}
            onClick={() => openLightbox(index)}
            aria-label={`View photo ${index + 1} of ${images.length}`}
          >
            <img
              src={image.thumbnail || image.full}
              alt={`${locationName} photo ${index + 1}`}
              loading="lazy"
            />
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
      {lightboxIndex !== null && (
        <div
          className="photo-mosaic__lightbox"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
        >
          <div className="photo-mosaic__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img
              src={images[lightboxIndex].full || images[lightboxIndex].thumbnail}
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

            {/* Counter */}
            <div className="photo-mosaic__lightbox-counter">
              {lightboxIndex + 1} / {images.length}
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
    </section>
  );
}

export default PhotoMosaic;
