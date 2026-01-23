/**
 * ExploreFiltersModal Component
 *
 * Full-screen modal for filtering explore page locations.
 * Sections: Location Type, Rating, Distance, Verified
 *
 * When initialSection is provided, shows ONLY that section (single-filter mode).
 * When initialSection is null, shows all sections (full-filter mode).
 *
 * Props:
 * - isOpen: boolean - Controls modal visibility
 * - onClose: () => void - Called when modal is closed
 * - initialSection: string | null - Section to show ('type', 'rating', 'distance') or null for all
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useExploreFilters } from '../../../hooks/useExploreFilters';
import './styles.css';

// Location type options with labels and icons
const LOCATION_TYPES = [
  { value: 'dark_sky_site', label: 'Dark Sky Site', icon: 'fa-solid fa-moon' },
  { value: 'observatory', label: 'Observatory', icon: 'fa-solid fa-tower-observation' },
  { value: 'campground', label: 'Campground', icon: 'fa-solid fa-campground' },
  { value: 'viewpoint', label: 'Viewpoint', icon: 'fa-solid fa-mountain-sun' },
  { value: 'other', label: 'Other', icon: 'fa-solid fa-location-dot' },
];

// Rating options
const RATING_OPTIONS = [1, 2, 3, 4, 5];

// Bortle scale options (lower = darker sky)
const BORTLE_OPTIONS = [
  { value: 1, label: 'Bortle 1', desc: 'Excellent dark-sky site' },
  { value: 2, label: 'Bortle 2 or darker', desc: 'Typical truly dark site' },
  { value: 3, label: 'Bortle 3 or darker', desc: 'Rural sky' },
  { value: 4, label: 'Bortle 4 or darker', desc: 'Rural/suburban transition' },
  { value: 5, label: 'Bortle 5 or darker', desc: 'Suburban sky' },
  { value: 6, label: 'Bortle 6 or darker', desc: 'Bright suburban' },
  { value: 7, label: 'Bortle 7 or darker', desc: 'Suburban/urban transition' },
  { value: 8, label: 'Bortle 8 or darker', desc: 'City sky' },
  { value: 9, label: 'Bortle 9 or darker', desc: 'Inner-city sky' },
];

// Radius options (in miles)
const RADIUS_OPTIONS = [10, 25, 50, 100, 250, 500];

function ExploreFiltersModal({ isOpen, onClose, initialSection = null }) {
  const {
    filters,
    setTypes,
    setMinRating,
    setVerified,
    setMaxBortle,
    setNear,
    setRadius,
    requestNearMe,
    clearFilters,
    activeFilterCount,
  } = useExploreFilters();

  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Determine if showing single section or all sections
  const isSingleSection = initialSection && ['type', 'rating', 'bortle', 'distance'].includes(initialSection);

  // Section titles for single-section mode
  const sectionTitles = {
    type: 'Location Type',
    rating: 'Minimum Rating',
    bortle: 'Sky Darkness',
    distance: 'Distance',
  };

  // Get modal title based on mode
  const modalTitle = isSingleSection ? sectionTitles[initialSection] : 'Filters';

  // Check if current section has active filter (for clear button in single-section mode)
  const sectionHasFilter = isSingleSection && (
    (initialSection === 'type' && filters.types.length > 0) ||
    (initialSection === 'rating' && filters.minRating !== null) ||
    (initialSection === 'bortle' && filters.maxBortle !== null) ||
    (initialSection === 'distance' && filters.near)
  );

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClose]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Handle type toggle
  const handleTypeToggle = useCallback((type) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    setTypes(newTypes);
  }, [filters.types, setTypes]);

  // Handle rating selection
  const handleRatingSelect = useCallback((rating) => {
    // If same rating clicked, clear it
    setMinRating(filters.minRating === rating ? null : rating);
  }, [filters.minRating, setMinRating]);

  // Handle Bortle selection
  const handleBortleSelect = useCallback((bortle) => {
    // If same bortle clicked, clear it
    setMaxBortle(filters.maxBortle === bortle ? null : bortle);
  }, [filters.maxBortle, setMaxBortle]);

  // Handle "Near Me" click
  const handleNearMe = useCallback(async () => {
    setIsRequestingLocation(true);
    await requestNearMe();
    setIsRequestingLocation(false);
  }, [requestNearMe]);

  // Handle radius change
  const handleRadiusChange = useCallback((newRadius) => {
    setRadius(newRadius);
  }, [setRadius]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  // Handle clear for single section
  const handleClearSection = useCallback(() => {
    if (initialSection === 'type') {
      setTypes([]);
    } else if (initialSection === 'rating') {
      setMinRating(null);
    } else if (initialSection === 'bortle') {
      setMaxBortle(null);
    } else if (initialSection === 'distance') {
      setNear(null, null);
    }
  }, [initialSection, setTypes, setMinRating, setMaxBortle, setNear]);

  if (!isOpen) return null;

  return createPortal(
    <div className={`explore-filters-overlay${isClosing ? ' explore-filters-overlay--closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`explore-filters-modal${isClosing ? ' explore-filters-modal--closing' : ''}${isSingleSection ? ' explore-filters-modal--single' : ''}`}>
        {/* Header */}
        <div className="explore-filters-modal__header">
          <button
            className="explore-filters-modal__close"
            onClick={handleClose}
            aria-label="Close filters"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <h2 className="explore-filters-modal__title">{modalTitle}</h2>
          {isSingleSection ? (
            sectionHasFilter && (
              <button
                className="explore-filters-modal__clear"
                onClick={handleClearSection}
              >
                Clear
              </button>
            )
          ) : (
            activeFilterCount > 0 && (
              <button
                className="explore-filters-modal__clear"
                onClick={handleClearAll}
              >
                Clear all
              </button>
            )
          )}
        </div>

        {/* Content */}
        <div className={`explore-filters-modal__content${isSingleSection ? ' explore-filters-modal__content--single' : ''}`}>
          {/* Location Type Section */}
          {(!isSingleSection || initialSection === 'type') && (
            <section className="explore-filters-modal__section">
              {!isSingleSection && (
                <h3 className="explore-filters-modal__section-title">Location Type</h3>
              )}
              <div className="explore-filters-modal__types">
                {LOCATION_TYPES.map((type) => (
                  <button
                    key={type.value}
                    className={`explore-filters-modal__type-btn ${
                      filters.types.includes(type.value) ? 'explore-filters-modal__type-btn--active' : ''
                    }`}
                    onClick={() => handleTypeToggle(type.value)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Rating Section */}
          {(!isSingleSection || initialSection === 'rating') && (
            <section className="explore-filters-modal__section">
              {!isSingleSection && (
                <h3 className="explore-filters-modal__section-title">Minimum Rating</h3>
              )}
              <div className="explore-filters-modal__ratings">
                {RATING_OPTIONS.map((rating) => (
                  <button
                    key={rating}
                    className={`explore-filters-modal__rating-btn ${
                      filters.minRating === rating ? 'explore-filters-modal__rating-btn--active' : ''
                    }`}
                    onClick={() => handleRatingSelect(rating)}
                  >
                    <span className="explore-filters-modal__rating-value">{rating}</span>
                    <i className="fa-solid fa-star"></i>
                    <span className="explore-filters-modal__rating-label">& up</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Bortle / Sky Darkness Section */}
          {(!isSingleSection || initialSection === 'bortle') && (
            <section className="explore-filters-modal__section">
              {!isSingleSection && (
                <h3 className="explore-filters-modal__section-title">Sky Darkness</h3>
              )}
              <p className="explore-filters-modal__section-desc">
                Filter by Bortle scale (lower = darker skies). <Link to="/bortle" className="explore-filters-modal__link" onClick={handleClose}>Learn more</Link>
              </p>
              <div className="explore-filters-modal__bortle-options">
                {BORTLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`explore-filters-modal__bortle-btn ${
                      filters.maxBortle === option.value ? 'explore-filters-modal__bortle-btn--active' : ''
                    }`}
                    onClick={() => handleBortleSelect(option.value)}
                  >
                    <span className="explore-filters-modal__bortle-label">{option.label}</span>
                    <span className="explore-filters-modal__bortle-desc">{option.desc}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Distance Section */}
          {(!isSingleSection || initialSection === 'distance') && (
            <section className="explore-filters-modal__section">
              {!isSingleSection && (
                <h3 className="explore-filters-modal__section-title">Distance</h3>
              )}

              {/* Near Me Button */}
              <button
                className={`explore-filters-modal__nearme-btn ${
                  filters.near === 'me' ? 'explore-filters-modal__nearme-btn--active' : ''
                }`}
                onClick={handleNearMe}
                disabled={isRequestingLocation || nearMeDisabled}
              >
                {isRequestingLocation ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Finding your location...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-location-arrow"></i>
                    <span>Near me</span>
                  </>
                )}
              </button>

              {/* Radius Selector (only shown when location is set) */}
              {filters.near && (
                <div className="explore-filters-modal__radius">
                  <label className="explore-filters-modal__radius-label">Within</label>
                  <div className="explore-filters-modal__radius-options">
                    {RADIUS_OPTIONS.map((r) => (
                      <button
                        key={r}
                        className={`explore-filters-modal__radius-btn ${
                          filters.radius === r ? 'explore-filters-modal__radius-btn--active' : ''
                        }`}
                        onClick={() => handleRadiusChange(r)}
                      >
                        {r} mi
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Verified Section - only in full mode */}
          {!isSingleSection && (
            <section className="explore-filters-modal__section">
              <div className="explore-filters-modal__verified-row">
                <div className="explore-filters-modal__verified-info">
                  <h3 className="explore-filters-modal__section-title">Verified Only</h3>
                  <p className="explore-filters-modal__verified-desc">
                    Show only locations verified by our team
                  </p>
                </div>
                <button
                  className={`explore-filters-modal__toggle ${
                    filters.verified ? 'explore-filters-modal__toggle--active' : ''
                  }`}
                  onClick={() => setVerified(!filters.verified)}
                  role="switch"
                  aria-checked={filters.verified}
                >
                  <span className="explore-filters-modal__toggle-knob"></span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="explore-filters-modal__footer">
          <button
            className="btn-primary btn-primary--lg explore-filters-modal__apply-btn"
            onClick={handleClose}
          >
            Show Results
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ExploreFiltersModal;
