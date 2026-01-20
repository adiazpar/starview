/**
 * ExploreFiltersModal Component
 *
 * Full-screen modal for filtering explore page locations.
 * Sections: Location Type, Rating, Distance, Verified
 * Supports auto-scrolling to specific section via initialSection prop.
 *
 * Props:
 * - isOpen: boolean - Controls modal visibility
 * - onClose: () => void - Called when modal is closed
 * - initialSection: string | null - Section to scroll to on open ('type', 'rating', 'distance')
 */

import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useExploreFilters } from '../../../hooks/useExploreFilters';
import './styles.css';

// Lazy load the heavy Mapbox Geocoder component
const LocationAutocomplete = lazy(() =>
  import('../../shared/LocationAutocomplete')
);

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

// Radius options (in miles)
const RADIUS_OPTIONS = [10, 25, 50, 100, 250, 500];

function ExploreFiltersModal({ isOpen, onClose, initialSection = null }) {
  const {
    filters,
    setTypes,
    setMinRating,
    setVerified,
    setNear,
    setRadius,
    requestNearMe,
    clearFilters,
    activeFilterCount,
    permissionState,
  } = useExploreFilters();

  // Local state for location search
  const [locationSearchValue, setLocationSearchValue] = useState(filters.nearPlace || '');
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // Refs for section scrolling
  const sectionRefs = {
    type: useRef(null),
    rating: useRef(null),
    distance: useRef(null),
  };

  // Scroll to initial section when modal opens
  useEffect(() => {
    if (isOpen && initialSection && sectionRefs[initialSection]?.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        sectionRefs[initialSection].current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
  }, [isOpen, initialSection]);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
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

  // Handle "Near Me" click
  const handleNearMe = useCallback(async () => {
    setIsRequestingLocation(true);
    const result = await requestNearMe();
    setIsRequestingLocation(false);

    if (result.success) {
      setLocationSearchValue('My Location');
    }
  }, [requestNearMe]);

  // Handle location search selection
  const handleLocationSelect = useCallback((data) => {
    if (data.location && data.latitude && data.longitude) {
      setLocationSearchValue(data.location);
      setNear(`${data.latitude},${data.longitude}`, data.location);
    } else {
      setLocationSearchValue('');
      setNear(null, null);
    }
  }, [setNear]);

  // Handle radius change
  const handleRadiusChange = useCallback((newRadius) => {
    setRadius(newRadius);
  }, [setRadius]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    clearFilters();
    setLocationSearchValue('');
  }, [clearFilters]);

  // Sync location search value with filters
  useEffect(() => {
    if (filters.near === 'me') {
      setLocationSearchValue('My Location');
    } else if (filters.nearPlace) {
      setLocationSearchValue(filters.nearPlace);
    } else if (!filters.near) {
      setLocationSearchValue('');
    }
  }, [filters.near, filters.nearPlace]);

  if (!isOpen) return null;

  return createPortal(
    <div className="explore-filters-overlay" onClick={handleOverlayClick}>
      <div className="explore-filters-modal">
        {/* Header */}
        <div className="explore-filters-modal__header">
          <button
            className="explore-filters-modal__close"
            onClick={onClose}
            aria-label="Close filters"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <h2 className="explore-filters-modal__title">Filters</h2>
          {activeFilterCount > 0 && (
            <button
              className="explore-filters-modal__clear"
              onClick={handleClearAll}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Content */}
        <div className="explore-filters-modal__content">
          {/* Location Type Section */}
          <section
            ref={sectionRefs.type}
            className="explore-filters-modal__section"
          >
            <h3 className="explore-filters-modal__section-title">Location Type</h3>
            <div className="explore-filters-modal__types">
              {LOCATION_TYPES.map((type) => (
                <button
                  key={type.value}
                  className={`explore-filters-modal__type-btn ${
                    filters.types.includes(type.value) ? 'explore-filters-modal__type-btn--active' : ''
                  }`}
                  onClick={() => handleTypeToggle(type.value)}
                >
                  <i className={type.icon}></i>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Rating Section */}
          <section
            ref={sectionRefs.rating}
            className="explore-filters-modal__section"
          >
            <h3 className="explore-filters-modal__section-title">Minimum Rating</h3>
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

          {/* Distance Section */}
          <section
            ref={sectionRefs.distance}
            className="explore-filters-modal__section"
          >
            <h3 className="explore-filters-modal__section-title">Distance</h3>

            {/* Near Me Button */}
            <button
              className={`explore-filters-modal__nearme-btn ${
                filters.near === 'me' ? 'explore-filters-modal__nearme-btn--active' : ''
              }`}
              onClick={handleNearMe}
              disabled={isRequestingLocation || permissionState === 'denied'}
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

            {permissionState === 'denied' && (
              <p className="explore-filters-modal__permission-hint">
                Location access denied. Please search for a place instead.
              </p>
            )}

            {/* Divider */}
            <div className="explore-filters-modal__divider">
              <span className="explore-filters-modal__divider-line"></span>
              <span className="explore-filters-modal__divider-text">or search</span>
              <span className="explore-filters-modal__divider-line"></span>
            </div>

            {/* Location Search */}
            <div className="explore-filters-modal__location-search">
              <Suspense
                fallback={
                  <div className="explore-filters-modal__search-loading">
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading search...</span>
                  </div>
                }
              >
                <LocationAutocomplete
                  value={locationSearchValue}
                  onSelect={handleLocationSelect}
                  placeholder="Search for a city or region..."
                />
              </Suspense>
            </div>

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

          {/* Verified Section */}
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
        </div>

        {/* Footer */}
        <div className="explore-filters-modal__footer">
          <button
            className="btn-primary btn-primary--lg explore-filters-modal__apply-btn"
            onClick={onClose}
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
