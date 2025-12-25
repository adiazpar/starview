/* ExploreMap Component
 * Interactive Mapbox map displaying stargazing locations.
 * Uses native symbol layers for smooth marker rendering.
 * Bottom card slides up when marker is tapped (Airbnb-style).
 *
 * Optimization: All card data comes from the map_markers endpoint,
 * eliminating the need for a second API call when tapping markers.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapMarkers } from '../../../hooks/useMapMarkers';
import { useUserLocation } from '../../../hooks/useUserLocation';
import { useAuth } from '../../../context/AuthContext';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { calculateDistance, formatDistance, formatElevation } from '../../../utils/geo';
import './styles.css';

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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isCardVisible, setIsCardVisible] = useState(false); // Controls animation
  const [isSwitching, setIsSwitching] = useState(false); // Fade vs slide animation
  const [isSaved, setIsSaved] = useState(false);

  const { markers, isLoading, isError } = useMapMarkers();
  const { location: userLocation } = useUserLocation();
  const { isAuthenticated } = useAuth();
  const toggleFavorite = useToggleFavorite();

  // Keep markersRef in sync with markers data
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

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

    // Convert markers to GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: markers.map((location) => ({
        type: 'Feature',
        properties: {
          id: location.id,
          name: location.name,
        },
        geometry: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
      })),
    };

    // Check if source already exists
    if (map.current.getSource('locations')) {
      // Update existing source
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
          'circle-color': '#3b82f6', // accent color
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Handle click on markers - use cached data (no API call needed)
      map.current.on('click', 'location-markers', (e) => {
        const feature = e.features[0];
        const id = feature.properties.id;

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
              setIsSaved(location.is_favorited || false);
              setIsSwitching(false);
            }, 150);
          } else {
            // Instant open for first marker click
            setSelectedLocation(location);
            setIsSaved(location.is_favorited || false);
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
  }, [markers, mapLoaded, isLoading]);

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

  // Handle close card with animation
  const handleCloseCard = () => {
    setIsCardVisible(false);
    setTimeout(() => setSelectedLocation(null), 300);
  };

  // Handle click on location card
  const handleViewLocation = () => {
    if (selectedLocation) {
      console.log('Navigate to location:', selectedLocation.name);
      // TODO: Navigate to location detail page
    }
  };

  // Handle favorite toggle
  const handleToggleFavorite = (e) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      console.log('Please log in to save locations');
      return;
    }

    // Optimistic update
    setIsSaved(!isSaved);

    toggleFavorite.mutate(selectedLocation.id, {
      onError: () => {
        setIsSaved(isSaved);
      },
    });
  };

  // Build location subtitle
  const getLocationSubtitle = (location) => {
    const parts = [];
    if (location.administrative_area) parts.push(location.administrative_area);
    if (location.country) parts.push(location.country);
    return parts.join(', ');
  };

  // Calculate distance for selected location
  const getDistance = (location) => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      location.latitude,
      location.longitude
    );
  };

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
      <div ref={mapContainer} className="explore-map__container" />

      {isLoading && (
        <div className="explore-map__loading">
          <i className="fa-solid fa-spinner fa-spin"></i>
          <span>Loading locations...</span>
        </div>
      )}

      {/* Bottom Card - Airbnb Style */}
      {selectedLocation && (
        <div
          className={`explore-map__card ${isCardVisible ? 'explore-map__card--visible' : ''} ${isSwitching ? 'explore-map__card--switching' : ''}`}
          onClick={handleViewLocation}
        >
          {/* Image Section */}
          <div className="explore-map__card-image-container">
            <img
              src={selectedLocation.image || PLACEHOLDER_IMAGE}
              alt={selectedLocation.name}
              className="explore-map__card-image"
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
              className={`explore-map__card-favorite ${isSaved ? 'explore-map__card-favorite--active' : ''}`}
              onClick={handleToggleFavorite}
              aria-label={isSaved ? 'Remove from saved' : 'Save location'}
            >
              <i className={`fa-${isSaved ? 'solid' : 'regular'} fa-heart`}></i>
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
