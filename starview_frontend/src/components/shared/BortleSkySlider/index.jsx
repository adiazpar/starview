/* BortleSkySlider Component
 * Interactive comparison slider showing night sky degradation across all 9 Bortle classes.
 * Uses ESO's composite image with a draggable slider to reveal light pollution progression.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import './styles.css';

const BORTLE_CLASSES = [
  { class: 1, name: 'Excellent Dark Site', range: [0, 11.1] },
  { class: 2, name: 'Truly Dark Site', range: [11.1, 22.2] },
  { class: 3, name: 'Rural Sky', range: [22.2, 33.3] },
  { class: 4, name: 'Rural/Suburban', range: [33.3, 44.4] },
  { class: 5, name: 'Suburban Sky', range: [44.4, 55.5] },
  { class: 6, name: 'Bright Suburban', range: [55.5, 66.6] },
  { class: 7, name: 'Suburban/Urban', range: [66.6, 77.7] },
  { class: 8, name: 'City Sky', range: [77.7, 88.8] },
  { class: 9, name: 'Inner-City Sky', range: [88.8, 100] },
];

function getBortleClass(position) {
  for (const bortle of BORTLE_CLASSES) {
    if (position >= bortle.range[0] && position < bortle.range[1]) {
      return bortle;
    }
  }
  return BORTLE_CLASSES[8]; // Return class 9 for position 100
}

function BortleSkySlider({
  imageSrc = '/images/bortle/eso-bortle-sky-only.jpg',
  credit = 'ESO/P. Horálek, M. Wallner',
  creditUrl = 'https://www.eso.org/public/images/dark-skies/',
}) {
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const currentBortle = getBortleClass(sliderPosition);

  const updatePosition = useCallback((clientX) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  }, [isDragging, updatePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e) => {
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  }, [updatePosition]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    updatePosition(e.touches[0].clientX);
  }, [isDragging, updatePosition]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    const step = 11.1; // Move by one Bortle class
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setSliderPosition((prev) => Math.max(0, prev - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSliderPosition((prev) => Math.min(100, prev + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSliderPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSliderPosition(100);
    }
  }, []);

  // Global mouse/touch handlers when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return (
    <div className="bortle-sky-slider">
      <div
        ref={containerRef}
        className={`bortle-sky-slider__container ${isDragging ? 'bortle-sky-slider__container--dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-valuemin={1}
        aria-valuemax={9}
        aria-valuenow={currentBortle.class}
        aria-valuetext={`Bortle Class ${currentBortle.class}: ${currentBortle.name}`}
        aria-label="Bortle scale comparison slider"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <img
          src={imageSrc}
          alt="Night sky visibility across all Bortle classes, from pristine dark skies to light-polluted urban skies"
          className="bortle-sky-slider__image"
          draggable={false}
        />

        {/* Slider line */}
        <div
          className="bortle-sky-slider__line"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="bortle-sky-slider__thumb">
            <i className="fa-solid fa-grip-lines-vertical" />
          </div>
        </div>

        {/* Position indicator overlay */}
        <div className="bortle-sky-slider__overlay" style={{ width: `${sliderPosition}%` }} />
      </div>

      {/* Range slider for accessibility */}
      <div className="bortle-sky-slider__controls">
        <span className="bortle-sky-slider__label">Darkest</span>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={sliderPosition}
          onChange={(e) => setSliderPosition(parseFloat(e.target.value))}
          className="bortle-sky-slider__range"
          aria-label="Bortle scale position"
        />
        <span className="bortle-sky-slider__label">Brightest</span>
      </div>

      {/* Class indicator */}
      <div className="bortle-sky-slider__indicator">
        <span className="bortle-sky-slider__indicator-class">Class {currentBortle.class}</span>
        <span className="bortle-sky-slider__indicator-divider">&mdash;</span>
        <span className="bortle-sky-slider__indicator-name">{currentBortle.name}</span>
      </div>

      {/* Attribution */}
      <a
        href={creditUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="bortle-sky-slider__credit"
      >
        Image: {credit} (CC BY 4.0)
      </a>
    </div>
  );
}

export default BortleSkySlider;
