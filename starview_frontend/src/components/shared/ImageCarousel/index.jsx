/* ImageCarousel Component
 * Displays images with swipe gestures and tap zones for navigation.
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
  const [loadedImages, setLoadedImages] = useState(new Set([0]));
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const autoPlayRef = useRef(null);

  // Minimum swipe distance to trigger navigation (in pixels)
  const minSwipeDistance = 50;

  // Safely get images length (handles null/undefined)
  const imageCount = images?.length || 0;

  // Auto-advance effect
  useEffect(() => {
    // Only auto-play if enabled, not paused, and more than 1 image
    if (!autoPlay || isPaused || imageCount <= 1) {
      return;
    }

    autoPlayRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        const nextIndex = prev < imageCount - 1 ? prev + 1 : 0;
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

  // Navigation handlers - defined before early returns to satisfy Rules of Hooks
  const handlePrev = useCallback((e) => {
    e?.stopPropagation();
    if (imageCount <= 1) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : imageCount - 1;
    setCurrentIndex(newIndex);
    setLoadedImages(prev => new Set([...prev, newIndex]));
  }, [currentIndex, imageCount]);

  const handleNext = useCallback((e) => {
    e?.stopPropagation();
    if (imageCount <= 1) return;
    const newIndex = currentIndex < imageCount - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    setLoadedImages(prev => new Set([...prev, newIndex]));
  }, [currentIndex, imageCount]);

  const handleDotClick = useCallback((e, index) => {
    e.stopPropagation();
    setCurrentIndex(index);
    setLoadedImages(prev => new Set([...prev, index]));
  }, []);

  // Touch handlers for swipe
  const onTouchStart = useCallback((e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd || imageCount <= 1) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      // Swipe left = next image
      const newIndex = currentIndex < imageCount - 1 ? currentIndex + 1 : 0;
      setCurrentIndex(newIndex);
      setLoadedImages(prev => new Set([...prev, newIndex]));
    }
    if (isRightSwipe) {
      // Swipe right = previous image
      const newIndex = currentIndex > 0 ? currentIndex - 1 : imageCount - 1;
      setCurrentIndex(newIndex);
      setLoadedImages(prev => new Set([...prev, newIndex]));
    }
  }, [touchStart, touchEnd, currentIndex, imageCount]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') {
      handlePrev(e);
    } else if (e.key === 'ArrowRight') {
      handleNext(e);
    }
  }, [handlePrev, handleNext]);

  // Preload adjacent images on arrow hover
  const preloadImage = useCallback((index) => {
    if (index >= 0 && index < imageCount && !loadedImages.has(index)) {
      const img = new Image();
      img.src = images[index]?.thumbnail || images[index]?.full;
    }
  }, [images, imageCount, loadedImages]);

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
      style={{ aspectRatio }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={`Image carousel with ${imageCount} images`}
    >
      {/* Image Track */}
      <div
        className="image-carousel__track"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {images.map((image, index) => (
          <div key={image.id || index} className="image-carousel__slide">
            {loadedImages.has(index) ? (
              <img
                src={image.full || image.thumbnail}
                alt={`${alt} - image ${index + 1}`}
                className="image-carousel__image"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            ) : (
              <div className="image-carousel__placeholder" />
            )}
          </div>
        ))}
      </div>

      {/* Tap zones for navigation (invisible, left/right edges) */}
      <button
        className="image-carousel__tap-zone image-carousel__tap-zone--left"
        onClick={handlePrev}
        onMouseEnter={() => preloadImage(currentIndex - 1)}
        aria-label="Previous image"
      />
      <button
        className="image-carousel__tap-zone image-carousel__tap-zone--right"
        onClick={handleNext}
        onMouseEnter={() => preloadImage(currentIndex + 1)}
        aria-label="Next image"
      />

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
  );
}

export default memo(ImageCarousel);
