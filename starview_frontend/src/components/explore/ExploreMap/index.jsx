/* ExploreMap Component
 * Interactive Mapbox map displaying stargazing locations.
 * Uses native symbol layers for smooth marker rendering.
 * Bottom card slides up when marker is tapped (Airbnb-style).
 *
 * Features:
 * - Dynamic day/night lighting based on user's local sun position
 * - All card data comes from map_markers endpoint (no extra API calls)
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SunCalc from 'suncalc';
import { useMapMarkers } from '../../../hooks/useMapMarkers';
import { useUserLocation } from '../../../hooks/useUserLocation';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { calculateDistance, formatDistance, formatElevation } from '../../../utils/geo';
import ImageCarousel from '../../shared/ImageCarousel';
import './styles.css';

/**
 * Calculate the appropriate Mapbox light preset based on sun position.
 * Uses astronomical definitions for twilight phases.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {'day' | 'dusk' | 'dawn' | 'night'} Light preset name
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

// Mapbox access token from environment
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Default center (US) if no user location
const DEFAULT_CENTER = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 3;

// Placeholder image for locations without photos
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80';


function ExploreMap({ initialViewport, onViewportChange }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]); // Store markers for click handler lookup
  const selectedIdRef = useRef(null); // Track selected ID for click handler
  const userLocationRef = useRef(null); // For accessing location in event handlers
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isCardVisible, setIsCardVisible] = useState(false); // Controls animation
  const [isSwitching, setIsSwitching] = useState(false); // Fade vs slide animation

  const { markers, isLoading, isError } = useMapMarkers();
  const { location: userLocation } = useUserLocation();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();

  // Update selectedLocation when markers change (keeps card in sync with cache)
  useEffect(() => {
    if (selectedLocation && markers.length > 0) {
      const updatedMarker = markers.find((m) => m.id === selectedLocation.id);
      if (updatedMarker && updatedMarker.is_favorited !== selectedLocation.is_favorited) {
        setSelectedLocation(updatedMarker);
      }
    }
  }, [markers, selectedLocation]);

  // Keep markersRef in sync with markers data
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Keep selectedIdRef in sync with selectedLocation
  useEffect(() => {
    selectedIdRef.current = selectedLocation?.id || null;
  }, [selectedLocation]);

  // Keep userLocationRef in sync for event handlers
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Memoize GeoJSON generation to prevent recreating objects on every render
  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: markers.map((location) => ({
      type: 'Feature',
      properties: {
        id: location.id,
        name: location.name,
        is_favorited: location.is_favorited || false,
      },
      geometry: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
      },
    })),
  }), [markers]);

  // Memoize helper functions to prevent recreating on every render
  const getLocationSubtitle = useCallback((location) => {
    const parts = [];
    if (location.administrative_area) parts.push(location.administrative_area);
    if (location.country) parts.push(location.country);
    return parts.join(', ');
  }, []);

  const getDistance = useCallback((location) => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      location.latitude,
      location.longitude
    );
  }, [userLocation]);

  // Memoize event handlers to prevent recreating on every render
  const handleCloseCard = useCallback(() => {
    setIsCardVisible(false);
    setTimeout(() => setSelectedLocation(null), 300);
  }, []);

  const handleViewLocation = useCallback(() => {
    if (selectedLocation) {
      console.log('Navigate to location:', selectedLocation.name);
      // TODO: Navigate to location detail page
    }
  }, [selectedLocation]);

  // Handle favorite toggle - redirects to login if not authenticated
  const handleToggleFavorite = useCallback((e) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    toggleFavorite.mutate(selectedLocation.id);
  }, [requireAuth, selectedLocation?.id, toggleFavorite]);

  // Handle card open animation
  useEffect(() => {
    if (selectedLocation && !isCardVisible) {
      // Use requestAnimationFrame to ensure DOM is ready before animating
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsCardVisible(true);
        });
      });
    }
  }, [selectedLocation]);

  // Initialize map
  useEffect(() => {
    if (map.current) return; // Already initialized

    // Use saved viewport if available, otherwise use user location or defaults
    const center = initialViewport?.center
      || (userLocation ? [userLocation.longitude, userLocation.latitude] : DEFAULT_CENTER);
    const zoom = initialViewport?.zoom
      ?? (userLocation ? 6 : DEFAULT_ZOOM);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      center: center,
      zoom: zoom,
      attributionControl: false,
    });

    // Add compact attribution control (required by Mapbox ToS)
    map.current.addControl(new mapboxgl.AttributionControl({ compact: true }));

    // Apply light preset immediately when style loads (before first render)
    // This prevents the flash of day mode when it should be night
    map.current.on('style.load', () => {
      const loc = userLocationRef.current || userLocation;
      const preset = loc
        ? getLightPreset(loc.latitude, loc.longitude)
        : 'day'; // Default to day if no geolocation
      map.current.setConfigProperty('basemap', 'lightPreset', preset);

      // Configure fog/atmosphere - transparent space for custom starfield
      map.current.setFog({
        'color': 'rgb(186, 210, 235)', // Lower atmosphere (white glow)
        'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
        'horizon-blend': 0.02, // Thin atmospheric glow
        'space-color': 'rgba(0, 0, 0, 0)', // Transparent - shows our starfield
        'star-intensity': 0, // Hide Mapbox stars - we have our own
      });

      // Enable 3D terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    });

    // Set up map load handler
    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Save viewport when map moves
    map.current.on('moveend', () => {
      if (onViewportChange) {
        onViewportChange({
          center: map.current.getCenter().toArray(),
          zoom: map.current.getZoom(),
        });
      }
    });

    // Close card when clicking on map (not on markers)
    map.current.on('click', (e) => {
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['location-markers'],
      });
      if (features.length === 0) {
        // Animate out, then unmount
        setIsCardVisible(false);
        setTimeout(() => setSelectedLocation(null), 300);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Add/update markers when data changes
  useEffect(() => {
    if (!map.current || !mapLoaded || isLoading || markers.length === 0) return;

    // Check if source already exists
    if (map.current.getSource('locations')) {
      // Update existing source with memoized geojson
      map.current.getSource('locations').setData(geojson);
    } else {
      // Add new source and layer
      map.current.addSource('locations', {
        type: 'geojson',
        data: geojson,
      });

      // Add circle layer for markers
      map.current.addLayer({
        id: 'location-markers',
        type: 'circle',
        source: 'locations',
        paint: {
          'circle-radius': 12,
          // Pink for favorited, blue for regular
          'circle-color': [
            'case',
            ['get', 'is_favorited'],
            '#ec4899', // pink-500 for favorites
            '#3b82f6', // blue-500 for regular
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          // Emit light so markers stay bright in night mode
          'circle-emissive-strength': 1,
        },
      });

      // Handle click on markers - use cached data (no API call needed)
      map.current.on('click', 'location-markers', (e) => {
        const feature = e.features[0];
        const id = feature.properties.id;
        const coordinates = feature.geometry.coordinates;

        // Calculate offset to center marker in visible area above the card
        // Card takes ~45% of viewport, so we offset the center point upward
        const cardHeight = Math.min(window.innerHeight * 0.45, 400);

        // Project marker coordinates to pixel position
        const markerPixel = map.current.project(coordinates);

        // Calculate where we want the marker: center of area above card
        // Offset = half the card height (shifts center point down so marker appears higher)
        const offsetPixel = {
          x: markerPixel.x,
          y: markerPixel.y + (cardHeight / 2),
        };

        // Convert back to coordinates - this is where the map center should be
        const offsetCenter = map.current.unproject(offsetPixel);

        // Fly to the offset center (no padding, no zoom change)
        map.current.flyTo({
          center: [offsetCenter.lng, offsetCenter.lat],
          duration: 500,
        });

        // Skip card update if same marker is already selected
        if (selectedIdRef.current === id) return;

        // Find location in cached markers data
        const location = markersRef.current.find((m) => m.id === id);
        if (location) {
          // Check if a card is already open (switching) or first open
          const isAlreadyOpen = !!document.querySelector('.explore-map__card');

          if (isAlreadyOpen) {
            // Use fade animation when switching between markers
            setIsSwitching(true);
            setIsCardVisible(false);
            setTimeout(() => {
              setSelectedLocation(location);
              setIsSwitching(false);
            }, 150);
          } else {
            // Instant open for first marker click
            setSelectedLocation(location);
          }
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'location-markers', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'location-markers', () => {
        map.current.getCanvas().style.cursor = '';
      });
    }
  }, [geojson, mapLoaded, isLoading]);

  // Fly to user location when it becomes available (only if no saved viewport)
  useEffect(() => {
    if (map.current && userLocation && mapLoaded && !initialViewport) {
      map.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 6,
        duration: 2000,
      });
    }
  }, [userLocation, mapLoaded, initialViewport]);

  // Apply dynamic day/night lighting based on user's location
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    // Calculate and apply the initial light preset
    const updateLighting = () => {
      const preset = getLightPreset(userLocation.latitude, userLocation.longitude);
      map.current.setConfigProperty('basemap', 'lightPreset', preset);
    };

    updateLighting();

    // Update every 5 minutes to reflect time progression
    const interval = setInterval(updateLighting, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userLocation, mapLoaded]);

  if (isError) {
    return (
      <div className="explore-map explore-map--error">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <p>Failed to load map</p>
      </div>
    );
  }

  return (
    <div className="explore-map">
      <div ref={mapContainer} className={`explore-map__container ${mapLoaded ? 'explore-map__container--loaded' : ''}`} />

      {/* Bottom Card - Airbnb Style */}
      {selectedLocation && (
        <div
          className={`explore-map__card ${isCardVisible ? 'explore-map__card--visible' : ''} ${isSwitching ? 'explore-map__card--switching' : ''}`}
          onClick={handleViewLocation}
        >
          {/* Image Carousel Section */}
          <div className="explore-map__card-image-container">
            <ImageCarousel
              images={selectedLocation.images || []}
              alt={selectedLocation.name}
              aspectRatio="16 / 7"
            />

            {/* Close Button */}
            <button
              className="explore-map__card-close"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseCard();
              }}
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>

            {/* Favorite Button */}
            <button
              className={`explore-map__card-favorite ${selectedLocation.is_favorited ? 'explore-map__card-favorite--active' : ''}`}
              onClick={handleToggleFavorite}
              aria-label={selectedLocation.is_favorited ? 'Remove from saved' : 'Save location'}
            >
              <i className={`fa-${selectedLocation.is_favorited ? 'solid' : 'regular'} fa-heart`}></i>
            </button>
          </div>

          {/* Content Section */}
          <div className="explore-map__card-content">
            <div className="explore-map__card-header">
              <h3 className="explore-map__card-name">{selectedLocation.name}</h3>
              <span className="explore-map__card-region">
                {getLocationSubtitle(selectedLocation)}
              </span>
            </div>

            <div className="explore-map__card-meta">
              {/* Rating */}
              {selectedLocation.review_count > 0 ? (
                <div className="explore-map__card-rating">
                  <i className="fa-solid fa-star"></i>
                  <span>{parseFloat(selectedLocation.average_rating).toFixed(1)}</span>
                  <span className="explore-map__card-reviews">
                    ({selectedLocation.review_count})
                  </span>
                </div>
              ) : (
                <div className="explore-map__card-rating explore-map__card-rating--empty">
                  <i className="fa-regular fa-star"></i>
                  <span>No reviews yet</span>
                </div>
              )}

              {/* Elevation */}
              {selectedLocation.elevation !== null && selectedLocation.elevation !== undefined && (
                <div className="explore-map__card-elevation">
                  <i className="fa-solid fa-mountain"></i>
                  <span>{formatElevation(selectedLocation.elevation)}</span>
                </div>
              )}

              {/* Distance */}
              {getDistance(selectedLocation) !== null && (
                <div className="explore-map__card-distance">
                  <i className="fa-solid fa-location-arrow"></i>
                  <span>{formatDistance(getDistance(selectedLocation))} away</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExploreMap;
