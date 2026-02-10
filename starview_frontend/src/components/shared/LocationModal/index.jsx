/**
 * LocationModal Component
 *
 * Full-screen modal for changing location on sky pages.
 * Features: current location button, search, and recent locations.
 *
 * Props:
 * - isOpen: boolean - Controls modal visibility
 * - onClose: () => void - Called when modal is closed
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from '../../../contexts/LocationContext';
import LoadingSpinner from '../LoadingSpinner';
import './styles.css';

// Lazy load the heavy Mapbox Geocoder component
const LocationAutocomplete = lazy(() =>
  import('../LocationAutocomplete')
);

function LocationModal({ isOpen, onClose }) {
  const {
    location,
    recentLocations,
    setLocation,
    requestCurrentLocation,
  } = useLocation();

  const [isClosing, setIsClosing] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setSearchValue('');
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
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Handle "Use my current location" click
  const handleUseCurrentLocation = useCallback(async () => {
    setIsRequestingLocation(true);
    await requestCurrentLocation();
    setIsRequestingLocation(false);
    handleClose();
  }, [requestCurrentLocation, handleClose]);

  // Handle location search selection
  const handleLocationSelect = useCallback((data) => {
    if (data.location && data.latitude && data.longitude) {
      setLocation(data.latitude, data.longitude, data.location, 'search');
      handleClose();
    }
  }, [setLocation, handleClose]);

  // Handle recent location selection
  const handleRecentSelect = useCallback((recent) => {
    setLocation(recent.latitude, recent.longitude, recent.name, 'search');
    handleClose();
  }, [setLocation, handleClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`location-modal-overlay${isClosing ? ' location-modal-overlay--closing' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className={`location-modal${isClosing ? ' location-modal--closing' : ''}`}>
        {/* Header */}
        <div className="location-modal__header">
          <button
            className="location-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <h2 className="location-modal__title">Change Location</h2>
          <div className="location-modal__header-spacer"></div>
        </div>

        {/* Content */}
        <div className="location-modal__content">
          {/* Current location indicator */}
          {location && (
            <div className="location-modal__current">
              <span className="location-modal__current-label">Currently showing</span>
              <span className="location-modal__current-value">
                {location.name || 'Your location'}
              </span>
            </div>
          )}

          {/* Use my current location button */}
          <button
            className="location-modal__geolocate-btn"
            onClick={handleUseCurrentLocation}
            disabled={isRequestingLocation}
          >
            {isRequestingLocation ? (
              <>
                <LoadingSpinner size="xs" inline />
                <span>Finding your location...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-location-crosshairs"></i>
                <span>Use my current location</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="location-modal__divider">
            <span className="location-modal__divider-line"></span>
            <span className="location-modal__divider-text">or search</span>
            <span className="location-modal__divider-line"></span>
          </div>

          {/* Search */}
          <div className="location-modal__search">
            <Suspense
              fallback={
                <div className="location-modal__search-loading">
                  <LoadingSpinner size="xs" inline />
                  <span>Loading search...</span>
                </div>
              }
            >
              <LocationAutocomplete
                value={searchValue}
                onSelect={handleLocationSelect}
                placeholder="Search for a city..."
              />
            </Suspense>
          </div>

          {/* Recent locations */}
          {recentLocations.length > 0 && (
            <div className="location-modal__recent">
              <h3 className="location-modal__recent-title">Recent</h3>
              <ul className="location-modal__recent-list">
                {recentLocations.map((recent, index) => (
                  <li key={`${recent.latitude}-${recent.longitude}-${index}`}>
                    <button
                      className="location-modal__recent-btn"
                      onClick={() => handleRecentSelect(recent)}
                    >
                      <i className="fa-solid fa-clock-rotate-left location-modal__recent-icon"></i>
                      <span className="location-modal__recent-name">{recent.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LocationModal;
