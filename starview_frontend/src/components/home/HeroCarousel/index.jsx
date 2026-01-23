/**
 * HeroCarousel Component
 *
 * Background image carousel for the home page hero section.
 * Displays 5 random location images that rotate daily.
 * Auto-advances with crossfade transitions.
 */

import { useState, useEffect, useCallback } from 'react';
import { locationsApi } from '../../../services/locations';
import './styles.css';

const SLIDE_DURATION = 12000; // 12 seconds per slide

function HeroCarousel() {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch carousel images on mount
  useEffect(() => {
    const fetchImages = async () => {
      try {
        const response = await locationsApi.getHeroCarousel();
        if (response.data && response.data.length > 0) {
          setImages(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch hero carousel images:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, []);

  // Auto-advance slides
  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, SLIDE_DURATION);

    return () => clearInterval(interval);
  }, [images.length]);

  // Handle indicator click
  const goToSlide = useCallback((index) => {
    setCurrentIndex(index);
  }, []);

  // Don't render if no images
  if (isLoading || images.length === 0) {
    return null;
  }

  return (
    <div className="hero-carousel">
      {/* Background images with crossfade */}
      {images.map((image, index) => (
        <div
          key={image.id}
          className={`hero-carousel__slide ${index === currentIndex ? 'hero-carousel__slide--active' : ''}`}
          style={{ backgroundImage: `url(${image.image_url})` }}
          aria-hidden={index !== currentIndex}
        />
      ))}

      {/* Gradient overlay for text readability */}
      <div className="hero-carousel__overlay" />

      {/* Progress indicators */}
      {images.length > 1 && (
        <div className="hero-carousel__indicators">
          {images.map((image, index) => (
            <button
              key={image.id}
              className={`hero-carousel__indicator ${index === currentIndex ? 'hero-carousel__indicator--active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}: ${image.name}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
            >
              <span className="hero-carousel__indicator-progress" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default HeroCarousel;
