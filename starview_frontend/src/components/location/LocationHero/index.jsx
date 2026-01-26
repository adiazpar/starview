/* LocationHero Component
 * Full-bleed hero image with gradient overlay and location title.
 * Includes back navigation and share/save/visited actions.
 *
 * Props:
 * - location: Location object with all details
 * - onBack: Callback for back button
 * - ref: Ref to attach to the hero element for scroll detection
 * - isFavorited: Whether location is favorited
 * - isVisited: Whether location is marked as visited
 * - onFavorite: Callback for favorite toggle
 * - onMarkVisited: Callback for mark visited toggle
 * - onShare: Callback for share action
 */

import { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import { useUnits } from '../../../hooks/useUnits';
import './styles.css';

// Placeholder for locations without photos
const PLACEHOLDER_IMAGE = '/images/default_location.jpg';

const LocationHero = forwardRef(function LocationHero({
  location,
  onBack,
  isFavorited,
  isVisited,
  onFavorite,
  onMarkVisited,
  onShare,
}, ref) {
  const { formatElevation } = useUnits();
  const [imageErrors, setImageErrors] = useState({});
  const [imagesLoaded, setImagesLoaded] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitingIndex, setExitingIndex] = useState(null);

  // Track preloaded images
  const preloadedRef = useRef(new Set([0]));

  // Get all images or fallback to placeholder
  const images = location.images?.length > 0
    ? location.images
    : [{ id: 'placeholder', full: PLACEHOLDER_IMAGE, thumbnail: PLACEHOLDER_IMAGE }];

  const totalImages = images.length;
  const hasMultiple = totalImages > 1;

  // Preload adjacent images in background (not rendered, just cached)
  useEffect(() => {
    if (totalImages <= 1) return;

    const adjacentIndices = [
      (currentIndex - 1 + totalImages) % totalImages,
      (currentIndex + 1) % totalImages
    ];

    adjacentIndices.forEach(index => {
      if (!preloadedRef.current.has(index)) {
        const img = new Image();
        img.src = images[index].full || images[index].thumbnail;
        preloadedRef.current.add(index);
      }
    });
  }, [currentIndex, images, totalImages]);

  // Change image with crossfade animation
  const changeImage = useCallback((newIndex) => {
    if (exitingIndex !== null || newIndex === currentIndex) return;
    setExitingIndex(currentIndex);
    setCurrentIndex(newIndex);
  }, [currentIndex, exitingIndex]);

  // Navigate to next image (with wrap-around)
  const goToNext = useCallback(() => {
    if (!hasMultiple) return;
    changeImage((currentIndex + 1) % totalImages);
  }, [hasMultiple, currentIndex, totalImages, changeImage]);

  // Navigate to previous image (with wrap-around)
  const goToPrevious = useCallback(() => {
    if (!hasMultiple) return;
    changeImage((currentIndex - 1 + totalImages) % totalImages);
  }, [hasMultiple, currentIndex, totalImages, changeImage]);

  // Clear exiting image after fade-out animation
  const handleAnimationEnd = useCallback((e) => {
    if (e.target.classList.contains('location-hero__slide--exiting')) {
      setExitingIndex(null);
    }
  }, []);

  // Handle image error for specific index
  const handleImageError = useCallback((id) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  }, []);

  // Handle image load for specific index
  const handleImageLoad = useCallback((id) => {
    setTimeout(() => {
      setImagesLoaded(prev => ({ ...prev, [id]: true }));
    }, 50);
  }, []);

  // Build region string
  const region = [location.locality, location.administrative_area, location.country]
    .filter(Boolean)
    .join(', ');

  return (
    <header ref={ref} className="location-hero">
      {/* Left arrow - grid item */}
      {hasMultiple && (
        <button
          className="location-hero__arrow location-hero__arrow--left"
          onClick={goToPrevious}
          aria-label="Previous photo"
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
      )}

      {/* Hero Image Carousel - Crossfade (lazy loaded) */}
      <div className="location-hero__image-container">
        {/* Only render exiting + current images (max 2 in DOM) */}

        {/* Exiting image - fading out */}
        {exitingIndex !== null && (
          <div
            key={`exiting-${images[exitingIndex].id}`}
            className="location-hero__slide location-hero__slide--exiting"
            onAnimationEnd={handleAnimationEnd}
          >
            <img
              src={imageErrors[images[exitingIndex].id] ? PLACEHOLDER_IMAGE : (images[exitingIndex].full || images[exitingIndex].thumbnail)}
              alt={`${location.name} - Photo ${exitingIndex + 1}`}
              className="location-hero__image location-hero__image--loaded"
            />
          </div>
        )}

        {/* Current image - fading in or static */}
        <div
          key={`current-${images[currentIndex].id}`}
          className={`location-hero__slide location-hero__slide--active ${exitingIndex !== null ? 'location-hero__slide--entering' : ''}`}
        >
          <img
            src={imageErrors[images[currentIndex].id] ? PLACEHOLDER_IMAGE : (images[currentIndex].full || images[currentIndex].thumbnail)}
            alt={`${location.name} - Photo ${currentIndex + 1}`}
            className={`location-hero__image ${imagesLoaded[images[currentIndex].id] ? 'location-hero__image--loaded' : ''}`}
            onLoad={() => handleImageLoad(images[currentIndex].id)}
            onError={() => handleImageError(images[currentIndex].id)}
          />
        </div>

        <div className="location-hero__gradient" />
      </div>

      {/* Right arrow - grid item */}
      {hasMultiple && (
        <button
          className="location-hero__arrow location-hero__arrow--right"
          onClick={goToNext}
          aria-label="Next photo"
        >
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      )}

      {/* Top Navigation Bar */}
      <nav className="location-hero__nav">
        <button
          className="location-hero__back"
          onClick={onBack}
          aria-label="Go back"
        >
          <i className="fa-solid fa-arrow-left"></i>
          <span className="location-hero__back-text">Back</span>
        </button>

        <div className="location-hero__actions">
          <button
            className={`location-hero__action ${isFavorited ? 'location-hero__action--active' : ''}`}
            onClick={onFavorite}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
            <span className="location-hero__action-text">
              {isFavorited ? 'Saved' : 'Save'}
            </span>
          </button>
          <button
            className={`location-hero__action ${isVisited ? 'location-hero__action--visited' : ''}`}
            onClick={onMarkVisited}
            aria-label={isVisited ? 'Remove visit' : 'Mark as visited'}
          >
            <i className={`fa-${isVisited ? 'solid' : 'regular'} fa-flag`}></i>
            <span className="location-hero__action-text">
              {isVisited ? 'Visited' : 'Visit'}
            </span>
          </button>
          <button
            className="location-hero__action"
            onClick={onShare}
            aria-label="Share location"
          >
            <i className="fa-solid fa-share"></i>
            <span className="location-hero__action-text">Share</span>
          </button>
        </div>
      </nav>

      {/* Location Info Overlay */}
      <div className="location-hero__info">
        {/* Dot indicators */}
        <div className="location-hero__dots">
          {images.map((_, index) => (
            <button
              key={index}
              className={`location-hero__dot ${index === currentIndex ? 'location-hero__dot--active' : ''}`}
              onClick={() => changeImage(index)}
              aria-label={`Go to photo ${index + 1}`}
            />
          ))}
        </div>

        {location.is_verified && (
          <div className="location-hero__badges">
            <span className="location-hero__badge location-hero__badge--verified">
              <i className="fa-solid fa-circle-check"></i>
              Verified
            </span>
          </div>
        )}

        <h1 className="location-hero__title">{location.name}</h1>

        {region && (
          <p className="location-hero__region">{region}</p>
        )}

        {/* Stats Row */}
        <div className="location-hero__stats">
          {location.average_rating > 0 ? (
            <span className="location-hero__stat">
              <i className="fa-solid fa-star"></i>
              {parseFloat(location.average_rating).toFixed(1)}
              <span className="location-hero__stat-label">
                ({location.review_count} {location.review_count === 1 ? 'review' : 'reviews'})
              </span>
            </span>
          ) : (
            <span className="location-hero__stat location-hero__stat--muted">
              <i className="fa-regular fa-star"></i>
              <span className="location-hero__stat-label">No reviews yet</span>
            </span>
          )}

          {location.bortle_class && (
            <>
              <span className="location-hero__stat-divider">•</span>
              <span className="location-hero__stat">
                B{location.bortle_class}
                <span className="location-hero__stat-label">Bortle</span>
              </span>
            </>
          )}

          {location.elevation && (
            <>
              <span className="location-hero__stat-divider">•</span>
              <span className="location-hero__stat">
                {formatElevation(location.elevation)}
                <span className="location-hero__stat-label">elevation</span>
              </span>
            </>
          )}

          {/* Photo counter - pushed to right */}
          <span className="location-hero__photo-counter">
            {currentIndex + 1}/{totalImages}
          </span>
        </div>
      </div>
    </header>
  );
});

export default LocationHero;
