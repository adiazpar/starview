/* LocationMap Component
 * Interactive 3D terrain map with orbit controls and directions link.
 * Uses Mapbox GL JS with terrain for immersive location visualization.
 *
 * Features:
 * - Lazy loading: Map only initializes when scrolled into view
 * - Orbit rotation: Drag to rotate around the location
 * - Zoom controls: Scroll/pinch to zoom (with limits)
 * - Click to navigate: Tap/click (without drag) opens directions
 * - Dynamic lighting: Day/night based on sun position
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
const CAMERA_BEARING = -20; // Initial rotation from north
const DEFAULT_ZOOM = 15.5; // Starting zoom level (also minimum - can't zoom out past this)
const MAX_ZOOM = 20; // Maximum zoom (can zoom in close for detail)
const TERRAIN_EXAGGERATION = 1.5;
const TERRAIN_MAX_ZOOM = 12; // Reduced from 14 for performance

// Interaction settings
const ROTATION_SPEED = 0.3; // Degrees per pixel of mouse movement
const CLICK_THRESHOLD = 5; // Pixels of movement before considered a drag

// Intersection Observer threshold for lazy loading
const VISIBILITY_THRESHOLD = 0.1;

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

  // State
  const [isVisible, setIsVisible] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Interaction tracking refs (refs to avoid re-renders)
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const totalDragDistance = useRef(0);

  const { id, latitude, longitude, name } = location;

  // Format coordinates for display
  const formatCoordinate = (value, isLat) => {
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(4)}° ${direction}`;
  };

  const coordsDisplay = `${formatCoordinate(latitude, true)}, ${formatCoordinate(longitude, false)}`;

  // Lazy loading: Observe when container becomes visible
  useEffect(() => {
    if (!mapContainer.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: VISIBILITY_THRESHOLD }
    );

    observer.observe(mapContainer.current);
    return () => observer.disconnect();
  }, []);

  // Initialize 3D map (only when visible)
  useEffect(() => {
    if (!isVisible || !mapContainer.current || !mapboxgl.accessToken) {
      if (isVisible && !mapboxgl.accessToken) {
        setMapError(true);
      }
      return;
    }
    if (map.current) return; // Already initialized

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/standard',
        center: [longitude, latitude],
        zoom: DEFAULT_ZOOM,
        pitch: CAMERA_PITCH,
        bearing: CAMERA_BEARING,
        minZoom: DEFAULT_ZOOM, // Can't zoom out past default view
        maxZoom: MAX_ZOOM,     // Can zoom in for detail
        attributionControl: false,
        // Disable default interactions - we'll handle them custom
        dragPan: false,
        dragRotate: false,
        keyboard: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        scrollZoom: false, // We'll enable with custom config below
        touchPitch: false,
      });

      // Enable scroll zoom centered on location (not cursor position)
      map.current.scrollZoom.enable({ around: 'center' });

      // Enable touch zoom centered on location (not pinch center)
      map.current.touchZoomRotate.enable({ around: 'center' });
      map.current.touchZoomRotate.disableRotation();

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

        // Enable 3D terrain with reduced resolution for performance
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: TERRAIN_MAX_ZOOM,
        });
        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: TERRAIN_EXAGGERATION,
        });
      });

      map.current.on('load', () => {
        setMapLoaded(true);
      });

      // Only catch fatal errors (WebGL context lost, authentication failures, etc.)
      // Ignore transient tile loading errors - Mapbox handles those gracefully
      map.current.on('error', (e) => {
        const message = e.error?.message || '';
        const status = e.error?.status;
        const isFatal = message.includes('WebGL') ||
                        message.includes('context') ||
                        status === 401 || // Unauthorized - bad API key
                        status === 403;   // Forbidden - domain restriction
        if (isFatal) {
          setMapError(true);
        }
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
  }, [isVisible, latitude, longitude]);

  // Handle orbit rotation (bearing changes while center stays fixed)
  const handlePointerDown = useCallback((e) => {
    if (!map.current || !mapLoaded) return;

    isDragging.current = true;
    totalDragDistance.current = 0;
    dragStart.current = {
      x: e.clientX ?? e.touches?.[0]?.clientX ?? 0,
      y: e.clientY ?? e.touches?.[0]?.clientY ?? 0,
    };

    // Prevent text selection while dragging
    e.preventDefault();
  }, [mapLoaded]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging.current || !map.current) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    const deltaX = clientX - dragStart.current.x;
    const deltaY = clientY - dragStart.current.y;

    // Track total drag distance to differentiate click vs drag
    totalDragDistance.current += Math.abs(deltaX) + Math.abs(deltaY);

    // Update bearing (horizontal drag rotates the view)
    const currentBearing = map.current.getBearing();
    const newBearing = currentBearing + deltaX * ROTATION_SPEED;
    map.current.setBearing(newBearing);

    // Update starting position for next move
    dragStart.current = { x: clientX, y: clientY };
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Add and remove event listeners for orbit control
  useEffect(() => {
    const container = mapContainer.current;
    if (!container || !mapLoaded) return;

    // Mouse events
    container.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    // Touch events
    container.addEventListener('touchstart', handlePointerDown, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      container.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      container.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [mapLoaded, handlePointerDown, handlePointerMove, handlePointerUp]);

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
  // Only triggers if user didn't drag (click/tap, not interaction)
  const handleDirectionsClick = useCallback(() => {
    // If user dragged more than threshold, it was an interaction, not a click
    if (totalDragDistance.current > CLICK_THRESHOLD) {
      return;
    }
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

      {/* Interactive 3D Map Container */}
      <div className="location-map__map-container">
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

        {/* Directions button - only responds to clicks, not drags */}
        <button
          className="location-map__directions"
          onClick={handleDirectionsClick}
          aria-label={`Get directions to ${name}`}
        >
          <i className="fa-solid fa-diamond-turn-right"></i>
          Directions
        </button>
      </div>
    </div>
  );
}

export default LocationMap;
