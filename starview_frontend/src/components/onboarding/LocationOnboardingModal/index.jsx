/**
 * LocationOnboardingModal Component
 *
 * Post-authentication modal prompting new users to set their location.
 * Features browser geolocation with reverse geocoding and Mapbox search.
 * Uses React Portal for proper layering above all content.
 *
 * Props:
 * - isOpen: boolean - Controls modal visibility
 * - onClose: () => void - Called when modal is closed
 * - onSave: (location: {location, latitude, longitude}) => void - Called when location is saved
 * - onSkip: () => void - Called when user skips location setup
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { reverseGeocode } from '../../../utils/navigation';
import './styles.css';

// Lazy load the heavy Mapbox Geocoder component (~185kB)
const LocationAutocomplete = lazy(() =>
  import('../../shared/LocationAutocomplete')
);

function LocationOnboardingModal({ isOpen, onClose, onSave, onSkip }) {
  // Location state
  const [locationData, setLocationData] = useState({
    location: '',
    latitude: null,
    longitude: null
  });

  // UI states
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [geoError, setGeoError] = useState(null);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle click on overlay (outside modal content)
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle "Use my current location" button
  const handleUseCurrentLocation = async () => {
    setGeoError(null);
    setIsGeolocating(true);

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser');
      setIsGeolocating(false);
      return;
    }

    try {
      // Get current position
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes cache
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get place name
      const result = await reverseGeocode(latitude, longitude);

      setLocationData({
        location: result.placeName,
        latitude: result.latitude,
        longitude: result.longitude
      });
    } catch (error) {
      // Handle geolocation errors
      if (error.code === 1) {
        setGeoError('Location access was denied. Please enable location permissions or search manually.');
      } else if (error.code === 2) {
        setGeoError('Unable to determine your location. Please try searching manually.');
      } else if (error.code === 3) {
        setGeoError('Location request timed out. Please try again or search manually.');
      } else {
        setGeoError('Unable to get your location. Please search manually.');
      }
    } finally {
      setIsGeolocating(false);
    }
  };

  // Handle location selection from autocomplete
  const handleLocationSelect = (data) => {
    setLocationData(data);
    setGeoError(null);
  };

  // Handle save
  const handleSave = async () => {
    if (!locationData.location) return;

    setIsSaving(true);
    try {
      await onSave(locationData);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle skip
  const handleSkip = () => {
    onSkip();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="location-modal-overlay" onClick={handleOverlayClick}>
      <div className="location-modal">
        {/* Close button */}
        <button
          className="location-modal__close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* Icon */}
        <div className="location-modal__icon">
          <i className="fa-solid fa-location-crosshairs"></i>
        </div>

        {/* Header */}
        <h2 className="location-modal__title">Set Your Location</h2>
        <p className="location-modal__subtitle">
          Get accurate moonrise times, see nearby stargazing spots, and unlock location-based features
        </p>

        {/* Geolocation button */}
        <button
          className="location-modal__geo-btn"
          onClick={handleUseCurrentLocation}
          disabled={isGeolocating || isSaving}
        >
          {isGeolocating ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>Finding your location...</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-location-arrow"></i>
              <span>Use my current location</span>
            </>
          )}
        </button>

        {/* Error message */}
        {geoError && (
          <div className="location-modal__error">
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{geoError}</span>
          </div>
        )}

        {/* Divider */}
        <div className="location-modal__divider">
          <span className="location-modal__divider-line"></span>
          <span className="location-modal__divider-text">or search manually</span>
          <span className="location-modal__divider-line"></span>
        </div>

        {/* Location autocomplete */}
        <div className="location-modal__search">
          <Suspense
            fallback={
              <div className="location-modal__search-loading">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Loading search...</span>
              </div>
            }
          >
            <LocationAutocomplete
              value={locationData.location}
              onSelect={handleLocationSelect}
              placeholder="Search for a city or region..."
              disabled={isSaving}
            />
          </Suspense>
        </div>

        {/* Selected location display */}
        {locationData.location && (
          <div className="location-modal__selected">
            <i className="fa-solid fa-check-circle"></i>
            <span>{locationData.location}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="location-modal__actions">
          <button
            className="location-modal__skip-btn"
            onClick={handleSkip}
            disabled={isSaving}
          >
            Skip for now
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!locationData.location || isSaving}
          >
            {isSaving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Saving...
              </>
            ) : (
              'Save Location'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LocationOnboardingModal;
