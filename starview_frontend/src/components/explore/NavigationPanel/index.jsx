/**
 * NavigationPanel - Compact panel for GPS directions
 *
 * Slides down from top of map when user clicks GPS button on a location card.
 * Shows FROM/TO fields, fetches route from Mapbox Directions API, displays
 * ETA/distance, and offers deep links to navigation apps.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMapboxDirections } from '../../../hooks/useMapboxDirections';
import {
  formatDuration,
  formatDistance,
  getNavigationUrls,
  geocodeAddress,
  getAvailableNavigationApps,
} from '../../../utils/navigation';
import './styles.css';

export default function NavigationPanel({
  isOpen,
  onClose,
  destination,
  userLocation,
  onRouteReceived,
  isDropdownMode = false,
}) {
  // Form state
  const [fromAddress, setFromAddress] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(null);

  // App picker state
  const [showAppPicker, setShowAppPicker] = useState(false);

  // Directions hook
  const { getRoute, routeData, isLoading, error, clearRoute } = useMapboxDirections();

  // Input ref for focus
  const fromInputRef = useRef(null);

  // Auto-fill FROM field when userLocation is available
  useEffect(() => {
    if (isOpen && userLocation) {
      setFromAddress('Current Location');
      setFromCoords({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
    } else if (isOpen) {
      setFromAddress('');
      setFromCoords(null);
    }
  }, [isOpen, userLocation]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !userLocation && fromInputRef.current) {
      setTimeout(() => fromInputRef.current?.focus(), 300);
    }
  }, [isOpen, userLocation]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowAppPicker(false);
      setGeocodeError(null);
      clearRoute();
    }
  }, [isOpen, clearRoute]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle "Get Directions" click
  const handleGetDirections = useCallback(async () => {
    if (!destination) return;

    let coords = fromCoords;

    // If user typed an address (not "Current Location"), geocode it
    if (fromAddress && fromAddress !== 'Current Location' && !fromCoords) {
      setIsGeocoding(true);
      setGeocodeError(null);

      try {
        coords = await geocodeAddress(fromAddress);
        setFromCoords(coords);
      } catch (err) {
        setGeocodeError(err.message);
        setIsGeocoding(false);
        return;
      }

      setIsGeocoding(false);
    }

    if (!coords) {
      setGeocodeError('Please enter a starting address');
      return;
    }

    // Fetch route
    const route = await getRoute(coords, {
      latitude: destination.latitude,
      longitude: destination.longitude,
    });

    if (route) {
      onRouteReceived(route.geometry, route.isEstimated);
    }
  }, [fromAddress, fromCoords, destination, getRoute, onRouteReceived]);

  // Handle "Navigate" click
  const handleNavigate = () => {
    setShowAppPicker(true);
  };

  // Handle app selection
  const handleAppSelect = (appId) => {
    if (!destination) return;

    const urls = getNavigationUrls(destination.latitude, destination.longitude);
    const url = urls[appId];

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Handle FROM input change
  const handleFromChange = (e) => {
    setFromAddress(e.target.value);
    // Clear coords if user is typing a new address
    if (fromCoords && e.target.value !== 'Current Location') {
      setFromCoords(null);
    }
    setGeocodeError(null);
  };

  // Use current location button
  const handleUseCurrentLocation = () => {
    if (userLocation) {
      setFromAddress('Current Location');
      setFromCoords({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
      setGeocodeError(null);
    }
  };

  const navigationApps = getAvailableNavigationApps();
  const hasRoute = routeData !== null;
  const canGetDirections = fromAddress.trim() !== '' && destination;

  // Dropdown mode: render content directly without outer container
  if (isDropdownMode) {
    return (
      <div className="navigation-panel navigation-panel--dropdown">
        {/* Form */}
        <div className="navigation-panel__form">
          {/* FROM field */}
          <div className="navigation-panel__field">
            <label className="navigation-panel__label">From</label>
            <div className="navigation-panel__input-wrapper">
              <input
                ref={fromInputRef}
                type="text"
                className="navigation-panel__input"
                placeholder={userLocation ? 'Current Location' : 'Enter starting address'}
                value={fromAddress}
                onChange={handleFromChange}
                disabled={isLoading || isGeocoding}
              />
              {userLocation && fromAddress !== 'Current Location' && (
                <button
                  type="button"
                  className="navigation-panel__location-btn"
                  onClick={handleUseCurrentLocation}
                  title="Use current location"
                >
                  <i className="fa-solid fa-location-crosshairs"></i>
                </button>
              )}
            </div>
          </div>

          {/* TO field */}
          <div className="navigation-panel__field">
            <label className="navigation-panel__label">To</label>
            <input
              type="text"
              className="navigation-panel__input navigation-panel__input--readonly"
              value={destination?.name || 'Select a location on the map'}
              readOnly
              placeholder="Select a location on the map"
            />
          </div>

          {/* Error messages */}
          {(geocodeError || error) && (
            <div className="navigation-panel__error">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{geocodeError || error}</span>
            </div>
          )}

          {/* Get Directions button (before route is loaded) */}
          {!hasRoute && (
            <button
              className="navigation-panel__btn navigation-panel__btn--primary"
              onClick={handleGetDirections}
              disabled={!canGetDirections || isLoading || isGeocoding}
            >
              {isLoading || isGeocoding ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>{isGeocoding ? 'Finding...' : 'Loading...'}</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-route"></i>
                  <span>Get Directions</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Route info (after route is loaded) */}
        {hasRoute && (
          <div className="navigation-panel__route">
            {/* Estimated route disclaimer (when APIs unavailable) */}
            {routeData.isEstimated && (
              <div className="navigation-panel__estimated">
                <i className="fa-solid fa-circle-info"></i>
                <span>Route services busy - open app for details</span>
              </div>
            )}

            {/* Only show time/distance for actual routes, not estimates */}
            {!routeData.isEstimated && (
              <div className="navigation-panel__route-info">
                <div className="navigation-panel__route-stat">
                  <i className="fa-solid fa-clock"></i>
                  <span>{formatDuration(routeData.duration)}</span>
                </div>
                <div className="navigation-panel__route-divider"></div>
                <div className="navigation-panel__route-stat">
                  <i className="fa-solid fa-road"></i>
                  <span>{formatDistance(routeData.distance)}</span>
                </div>
              </div>
            )}

            {/* Navigate button */}
            {!showAppPicker && (
              <button
                className="navigation-panel__btn navigation-panel__btn--primary"
                onClick={handleNavigate}
              >
                <i className="fa-solid fa-diamond-turn-right"></i>
                <span>Navigate</span>
              </button>
            )}

            {/* App picker */}
            {showAppPicker && (
              <div className="navigation-panel__apps">
                <p className="navigation-panel__apps-label">Open in:</p>
                <div className="navigation-panel__apps-grid">
                  {navigationApps.map((app) => (
                    <button
                      key={app.id}
                      className="navigation-panel__app-btn"
                      onClick={() => handleAppSelect(app.id)}
                    >
                      <i className={app.icon}></i>
                      <span>{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Original slide-down panel mode
  return (
    <div className={`navigation-panel ${isOpen ? 'navigation-panel--visible' : ''}`}>
      <div className="navigation-panel__content">
        {/* Header */}
        <div className="navigation-panel__header">
          <h3 className="navigation-panel__title">Get Directions</h3>
          <button
            className="navigation-panel__close"
            onClick={onClose}
            aria-label="Close navigation panel"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form */}
        <div className="navigation-panel__form">
          {/* FROM field */}
          <div className="navigation-panel__field">
            <label className="navigation-panel__label">From</label>
            <div className="navigation-panel__input-wrapper">
              <input
                ref={fromInputRef}
                type="text"
                className="navigation-panel__input"
                placeholder={userLocation ? 'Current Location' : 'Enter starting address'}
                value={fromAddress}
                onChange={handleFromChange}
                disabled={isLoading || isGeocoding}
              />
              {userLocation && fromAddress !== 'Current Location' && (
                <button
                  type="button"
                  className="navigation-panel__location-btn"
                  onClick={handleUseCurrentLocation}
                  title="Use current location"
                >
                  <i className="fa-solid fa-location-crosshairs"></i>
                </button>
              )}
            </div>
          </div>

          {/* TO field */}
          <div className="navigation-panel__field">
            <label className="navigation-panel__label">To</label>
            <input
              type="text"
              className="navigation-panel__input navigation-panel__input--readonly"
              value={destination?.name || ''}
              readOnly
            />
          </div>

          {/* Error messages */}
          {(geocodeError || error) && (
            <div className="navigation-panel__error">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{geocodeError || error}</span>
            </div>
          )}

          {/* Get Directions button (before route is loaded) */}
          {!hasRoute && (
            <button
              className="navigation-panel__btn navigation-panel__btn--primary"
              onClick={handleGetDirections}
              disabled={!canGetDirections || isLoading || isGeocoding}
            >
              {isLoading || isGeocoding ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>{isGeocoding ? 'Finding address...' : 'Getting directions...'}</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-route"></i>
                  <span>Get Directions</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Route info (after route is loaded) */}
        {hasRoute && (
          <div className="navigation-panel__route">
            {/* Estimated route disclaimer (when APIs unavailable) */}
            {routeData.isEstimated && (
              <div className="navigation-panel__estimated">
                <i className="fa-solid fa-circle-info"></i>
                <span>Route services busy - open app for details</span>
              </div>
            )}

            {/* Only show time/distance for actual routes, not estimates */}
            {!routeData.isEstimated && (
              <div className="navigation-panel__route-info">
                <div className="navigation-panel__route-stat">
                  <i className="fa-solid fa-clock"></i>
                  <span>{formatDuration(routeData.duration)}</span>
                </div>
                <div className="navigation-panel__route-divider"></div>
                <div className="navigation-panel__route-stat">
                  <i className="fa-solid fa-road"></i>
                  <span>{formatDistance(routeData.distance)}</span>
                </div>
              </div>
            )}

            {/* Navigate button */}
            {!showAppPicker && (
              <button
                className="navigation-panel__btn navigation-panel__btn--primary"
                onClick={handleNavigate}
              >
                <i className="fa-solid fa-diamond-turn-right"></i>
                <span>Navigate</span>
              </button>
            )}

            {/* App picker */}
            {showAppPicker && (
              <div className="navigation-panel__apps">
                <p className="navigation-panel__apps-label">Open in:</p>
                <div className="navigation-panel__apps-grid">
                  {navigationApps.map((app) => (
                    <button
                      key={app.id}
                      className="navigation-panel__app-btn"
                      onClick={() => handleAppSelect(app.id)}
                    >
                      <i className={app.icon}></i>
                      <span>{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
