/* LocationMap Component
 * 3D terrain map with coordinates display and directions link.
 * Uses Mapbox GL JS with terrain for immersive location visualization.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SunCalc from 'suncalc';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Mapbox configuration
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Camera settings for 3D view
const CAMERA_PITCH = 55; // Angle from vertical (0 = top-down, 90 = horizon)
const CAMERA_BEARING = -20; // Rotation from north (slight west angle for dramatic shadows)
const CAMERA_ZOOM = 15.5; // Close enough to see building detail
const TERRAIN_EXAGGERATION = 1.5;

/**
 * Calculate light preset based on sun position at location
 * Matches ExploreMap's lighting system for consistency
 */
function getLightPreset(lat, lng) {
  const now = new Date();
  const sunPos = SunCalc.getPosition(now, lat, lng);
  const altitudeDeg = sunPos.altitude * (180 / Math.PI);

  // Sun altitude thresholds (in degrees)
  // > 0°: Day (sun above horizon)
  // -6° to 0°: Civil twilight (dusk/dawn)
  // < -6°: Night (dark enough for stargazing)
  if (altitudeDeg > 0) {
    return 'day';
  } else if (altitudeDeg > -6) {
    // Civil twilight - determine if it's dusk or dawn
    const times = SunCalc.getTimes(now, lat, lng);
    const solarNoon = times.solarNoon.getTime();
    return now.getTime() < solarNoon ? 'dawn' : 'dusk';
  } else {
    return 'night';
  }
}

function LocationMap({ location, compact = false }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  const { id, latitude, longitude, name } = location;

  // Format coordinates for display
  const formatCoordinate = (value, isLat) => {
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(4)}° ${direction}`;
  };

  const coordsDisplay = `${formatCoordinate(latitude, true)}, ${formatCoordinate(longitude, false)}`;

  // Initialize 3D map
  useEffect(() => {
    if (!mapContainer.current || !mapboxgl.accessToken) {
      setMapError(true);
      return;
    }
    if (map.current) return; // Already initialized

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/standard',
        center: [longitude, latitude],
        zoom: CAMERA_ZOOM,
        pitch: CAMERA_PITCH,
        bearing: CAMERA_BEARING,
        attributionControl: false, // Attribution shown on Explore page
        interactive: false, // Disable all interactions for static display
      });

      // Reset view after resize to prevent zoom/position shifts
      map.current.on('resize', () => {
        map.current.jumpTo({
          center: [longitude, latitude],
          zoom: CAMERA_ZOOM,
          pitch: CAMERA_PITCH,
          bearing: CAMERA_BEARING,
        });
      });

      // Calculate light preset for this location
      const lightPreset = getLightPreset(latitude, longitude);

      // Configure map when style loads
      map.current.on('style.load', () => {
        // Apply light preset based on sun position at this location
        map.current.setConfigProperty('basemap', 'lightPreset', lightPreset);

        // Configure atmosphere for clean look
        map.current.setFog({
          color: 'rgba(186, 210, 235, 1)',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.02,
          'space-color': 'rgba(11, 11, 25, 1)',
          'star-intensity': 0.15,
        });

        // Enable 3D terrain
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: TERRAIN_EXAGGERATION,
        });
      });

      map.current.on('load', () => {
        setMapLoaded(true);
      });

      map.current.on('error', () => {
        setMapError(true);
      });
    } catch {
      setMapError(true);
    }

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [latitude, longitude]);

  // Copy coordinates to clipboard
  const handleCopyCoords = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${latitude}, ${longitude}`);
      showToast('Coordinates copied', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  }, [latitude, longitude, showToast]);

  // Navigate to explore map with navigation mode activated
  const handleGetDirections = useCallback(() => {
    navigate(`/explore?view=map&navigateTo=${id}`);
  }, [navigate, id]);

  return (
    <div className={`location-map ${compact ? 'location-map--compact' : ''}`}>
      {/* Header with clickable coordinates */}
      <button
        className="location-map__header"
        onClick={handleCopyCoords}
        title="Click to copy coordinates"
      >
        <span>{coordsDisplay}</span>
        <i className="fa-solid fa-copy"></i>
      </button>

      {/* Clickable 3D Map Container */}
      <button
        className="location-map__map-container"
        onClick={handleGetDirections}
        aria-label={`Get directions to ${name}`}
      >
        {mapError ? (
          <div className="location-map__placeholder">
            <i className="fa-solid fa-map"></i>
            <span>Map unavailable</span>
          </div>
        ) : (
          <>
            <div
              ref={mapContainer}
              className="location-map__map"
            />
            {!mapLoaded && (
              <div className="location-map__loading">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
            )}
          </>
        )}

        {/* Directions overlay button */}
        <span className="location-map__directions">
          <i className="fa-solid fa-diamond-turn-right"></i>
          Directions
        </span>
      </button>
    </div>
  );
}

export default LocationMap;
