/* LocationMap Component
 * Mini map with coordinates display and directions link.
 * Uses static Mapbox image for performance (no interactive map).
 */

import { useState, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Mapbox static image API
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function LocationMap({ location, compact = false }) {
  const { showToast } = useToast();
  const [imageError, setImageError] = useState(false);

  const { latitude, longitude, name } = location;

  // Format coordinates for display
  const formatCoordinate = (value, isLat) => {
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(4)}° ${direction}`;
  };

  const coordsDisplay = `${formatCoordinate(latitude, true)}, ${formatCoordinate(longitude, false)}`;

  // Generate static map URL
  const mapWidth = compact ? 360 : 600;
  const mapHeight = compact ? 200 : 300;
  const zoom = 12;
  const mapStyle = 'dark-v11';

  const staticMapUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/${mapStyle}/static/pin-l+00d4aa(${longitude},${latitude})/${longitude},${latitude},${zoom}/${mapWidth}x${mapHeight}@2x?access_token=${MAPBOX_TOKEN}`
    : null;

  // Copy coordinates to clipboard
  const handleCopyCoords = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${latitude}, ${longitude}`);
      showToast('Coordinates copied', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  }, [latitude, longitude, showToast]);

  // Open directions in maps app
  const handleGetDirections = useCallback(() => {
    // Try to detect platform and open appropriate maps app
    const iosUrl = `maps://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodeURIComponent(name)}`;
    const androidUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(name)})`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    // Try iOS first, then fall back to web
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);

    if (isIOS) {
      window.location.href = iosUrl;
    } else if (isAndroid) {
      window.location.href = androidUrl;
    } else {
      window.open(webUrl, '_blank');
    }
  }, [latitude, longitude, name]);

  return (
    <div className={`location-map glass-card ${compact ? 'location-map--compact' : ''}`}>
      {!compact && (
        <div className="location-map__header">
          <span>Location</span>
        </div>
      )}

      {/* Static Map Image */}
      <div className="location-map__image-container">
        {staticMapUrl && !imageError ? (
          <img
            src={staticMapUrl}
            alt={`Map showing ${name}`}
            className="location-map__image"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="location-map__placeholder">
            <i className="fa-solid fa-map"></i>
            <span>Map unavailable</span>
          </div>
        )}
      </div>

      {/* Coordinates */}
      <button
        className="location-map__coords"
        onClick={handleCopyCoords}
        title="Click to copy coordinates"
      >
        <span className="location-map__coords-value">{coordsDisplay}</span>
        <i className="fa-solid fa-copy"></i>
      </button>

      {/* Directions Button */}
      <button className="location-map__directions btn-primary" onClick={handleGetDirections}>
        <i className="fa-solid fa-diamond-turn-right"></i>
        Get Directions
      </button>
    </div>
  );
}

export default LocationMap;
