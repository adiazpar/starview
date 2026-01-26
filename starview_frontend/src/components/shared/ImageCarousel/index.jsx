/* ImageCarousel Component
 * Displays images with crossfade transitions and arrow navigation.
 * Includes indicator dots at bottom showing current position.
 */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import './styles.css';

// Placeholder image for locations without photos
const PLACEHOLDER_IMAGE = '/images/default_location.jpg';

function ImageCarousel({
  images = [],
  alt = 'Location',
  aspectRatio = '16 / 10',
  className = '',
  autoPlay = false,
  autoPlayInterval = 5000 // 5 seconds
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitingIndex, setExitingIndex] = useState(null);
  const [loadedImages, setLoadedImages] = useState(new Set([0]));
  const [isPaused, setIsPaused] = useState(false);
  const autoPlayRef = useRef(null);
  const preloadedRef = useRef(new Set([0]));

  // Safely get images length (handles null/undefined)
  const imageCount = images?.length || 0;

  // Preload adjacent images in background
  useEffect(() => {
    if (imageCount <= 1) return;

    const adjacentIndices = [
      (currentIndex - 1 + imageCount) % imageCount,
      (currentIndex + 1) % imageCount
    ];

    adjacentIndices.forEach(index => {
      if (!preloadedRef.current.has(index)) {
        const img = new Image();
        img.src = images[index]?.full || images[index]?.thumbnail;
        preloadedRef.current.add(index);
      }
    });
  }, [currentIndex, images, imageCount]);

  // Auto-advance effect
  useEffect(() => {
    if (!autoPlay || isPaused || imageCount <= 1) {
      return;
    }

    autoPlayRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        const nextIndex = (prev + 1) % imageCount;
        setExitingIndex(prev);
        setLoadedImages(loaded => new Set([...loaded, nextIndex]));
        return nextIndex;
      });
    }, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [autoPlay, autoPlayInterval, isPaused, imageCount]);

  // Pause on hover/focus
  const handleMouseEnter = useCallback(() => setIsPaused(true), []);
  const handleMouseLeave = useCallback(() => setIsPaused(false), []);

  // Change image with crossfade
  const changeImage = useCallback((newIndex) => {
    if (exitingIndex !== null || newIndex === currentIndex) return;
    setExitingIndex(currentIndex);
    setCurrentIndex(newIndex);
    setLoadedImages(prev => new Set([...prev, newIndex]));
  }, [currentIndex, exitingIndex]);

  // Navigation handlers
  const handlePrev = useCallback((e) => {
    e?.stopPropagation();
    if (imageCount <= 1) return;
    const newIndex = (currentIndex - 1 + imageCount) % imageCount;
    changeImage(newIndex);
  }, [currentIndex, imageCount, changeImage]);

  const handleNext = useCallback((e) => {
    e?.stopPropagation();
    if (imageCount <= 1) return;
    const newIndex = (currentIndex + 1) % imageCount;
    changeImage(newIndex);
  }, [currentIndex, imageCount, changeImage]);

  const handleDotClick = useCallback((e, index) => {
    e.stopPropagation();
    changeImage(index);
  }, [changeImage]);

  // Clear exiting image after animation
  const handleAnimationEnd = useCallback((e) => {
    if (e.target.classList.contains('image-carousel__slide--exiting')) {
      setExitingIndex(null);
    }
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') {
      handlePrev(e);
    } else if (e.key === 'ArrowRight') {
      handleNext(e);
    }
  }, [handlePrev, handleNext]);

  // No images - show placeholder
  if (imageCount === 0) {
    return (
      <div
        className={`image-carousel image-carousel--single ${className}`}
        style={{ aspectRatio }}
      >
        <img
          src={PLACEHOLDER_IMAGE}
          alt={alt}
          className="image-carousel__image"
          loading="lazy"
        />
      </div>
    );
  }

  // Single image - no carousel needed
  if (imageCount === 1) {
    return (
      <div
        className={`image-carousel image-carousel--single ${className}`}
        style={{ aspectRatio }}
      >
        <img
          src={images[0].full || images[0].thumbnail}
          alt={alt}
          className="image-carousel__image"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`image-carousel ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel with ${imageCount} images`}
    >
      {/* Left arrow */}
      <button
        className="image-carousel__arrow image-carousel__arrow--left"
        onClick={handlePrev}
        aria-label="Previous image"
      >
        <i className="fa-solid fa-chevron-left"></i>
      </button>

      {/* Image container with crossfade */}
      <div className="image-carousel__container" style={{ aspectRatio }}>
        {/* Exiting image - fading out */}
        {exitingIndex !== null && (
          <div
            key={`exiting-${images[exitingIndex]?.id || exitingIndex}`}
            className="image-carousel__slide image-carousel__slide--exiting"
            onAnimationEnd={handleAnimationEnd}
          >
            <img
              src={images[exitingIndex]?.full || images[exitingIndex]?.thumbnail}
              alt={`${alt} - image ${exitingIndex + 1}`}
              className="image-carousel__image"
            />
          </div>
        )}

        {/* Current image - fading in or static */}
        <div
          key={`current-${images[currentIndex]?.id || currentIndex}`}
          className={`image-carousel__slide image-carousel__slide--active ${exitingIndex !== null ? 'image-carousel__slide--entering' : ''}`}
        >
          {loadedImages.has(currentIndex) ? (
            <img
              src={images[currentIndex]?.full || images[currentIndex]?.thumbnail}
              alt={`${alt} - image ${currentIndex + 1}`}
              className="image-carousel__image"
            />
          ) : (
            <div className="image-carousel__placeholder" />
          )}
        </div>

        {/* Indicator Dots */}
        <div className="image-carousel__dots">
          {images.map((_, index) => (
            <button
              key={index}
              className={`image-carousel__dot ${index === currentIndex ? 'image-carousel__dot--active' : ''}`}
              onClick={(e) => handleDotClick(e, index)}
              aria-label={`Go to image ${index + 1}`}
              aria-current={index === currentIndex ? 'true' : undefined}
            />
          ))}
        </div>
      </div>

      {/* Right arrow */}
      <button
        className="image-carousel__arrow image-carousel__arrow--right"
        onClick={handleNext}
        aria-label="Next image"
      >
        <i className="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  );
}

export default memo(ImageCarousel);
