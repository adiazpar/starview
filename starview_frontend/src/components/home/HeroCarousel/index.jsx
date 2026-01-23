/**
 * HeroCarousel Component
 *
 * Background image carousel for the home page hero section.
 * Displays 5 random location images that rotate daily.
 * Auto-advances with crossfade transitions.
 * Preloads first image before showing to ensure smooth fade-in.
 */

import { useState, useEffect, useCallback } from 'react';
import { locationsApi } from '../../../services/locations';
import './styles.css';

const SLIDE_DURATION = 12000; // 12 seconds per slide

function HeroCarousel() {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false); // True when first image is loaded

  // Fetch carousel images on mount
  useEffect(() => {
    const fetchImages = async () => {
      try {
        const response = await locationsApi.getHeroCarousel();
        if (response.data && response.data.length > 0) {
          setImages(response.data);

          // Preload the first image before showing carousel
          const firstImage = new Image();
          firstImage.onload = () => {
            setIsReady(true);
          };
          firstImage.onerror = () => {
            // Still show carousel even if first image fails
            setIsReady(true);
          };
          firstImage.src = response.data[0].image_url;
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
    if (images.length <= 1 || !isReady) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, SLIDE_DURATION);

    return () => clearInterval(interval);
  }, [images.length, isReady]);

  // Handle indicator click
  const goToSlide = useCallback((index) => {
    setCurrentIndex(index);
  }, []);

  // Don't render if no images or not ready
  if (isLoading || images.length === 0 || !isReady) {
    return null;
  }

  return (
    <div className="hero-carousel hero-carousel--loaded">
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
