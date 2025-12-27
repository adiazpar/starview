/* ExploreMap Component
 * Interactive Mapbox map displaying stargazing locations.
 * Uses native symbol layers for smooth marker rendering.
 * Bottom card slides up when marker is tapped (Airbnb-style).
 *
 * Features:
 * - Dynamic day/night lighting based on user's local sun position
 * - All card data comes from map_markers endpoint (no extra API calls)
 * - Global protected areas layer from WDPA (colored by IUCN category)
 */

// Protected Areas PMTiles Configuration
// PMTiles file hosted on Cloudflare R2, contains 270K+ protected areas globally
const PROTECTED_AREAS_PMTILES_URL = 'https://media.starview.app/data/protected-areas.pmtiles';
const PROTECTED_AREAS_LAYER = 'protected_areas'; // Layer name set by tippecanoe -l flag

// IUCN category colors for protected areas
// Bright, saturated colors that read as UI elements (not geography)
const IUCN_COLORS = {
  'Ia': '#a855f7', // Strict Nature Reserve - Vivid Purple
  'Ib': '#818cf8', // Wilderness Area - Bright Indigo
  'II': '#34d399', // National Park - Bright Emerald
  'III': '#fbbf24', // Natural Monument - Bright Amber
  'IV': '#2dd4bf', // Habitat Management - Bright Teal
  'V': '#38bdf8', // Protected Landscape - Bright Sky
  'VI': '#a3e635', // Sustainable Use - Bright Lime
  'Not Reported': '#9ca3af', // Unknown - Light Gray
};

// IUCN category full names for display
const IUCN_NAMES = {
  'Ia': 'Strict Nature Reserve',
  'Ib': 'Wilderness Area',
  'II': 'National Park',
  'III': 'Natural Monument',
  'IV': 'Habitat Management Area',
  'V': 'Protected Landscape',
  'VI': 'Sustainable Use Area',
  'Not Reported': 'Not Classified',
};

/**
 * Generate HTML content for protected area popup
 */
function getProtectedAreaPopupHTML(properties) {
  const name = properties.name || 'Unknown Area';
  const designation = properties.desig || 'Protected Area';
  const iucnCat = properties.iucn_cat || 'Not Reported';
  const areaKm2 = properties.area_km2;
  const color = IUCN_COLORS[iucnCat] || IUCN_COLORS['Not Reported'];
  const iucnName = IUCN_NAMES[iucnCat] || iucnCat;

  // Format area with appropriate units
  const areaFormatted = areaKm2
    ? (areaKm2 >= 1000
        ? `${(areaKm2 / 1000).toFixed(1)}k km²`
        : `${Math.round(areaKm2).toLocaleString()} km²`)
    : null;

  return `
    <div class="protected-area-popup">
      <div class="protected-area-popup__header">
        <span class="protected-area-popup__color" style="background: ${color}"></span>
        <span class="protected-area-popup__name">${name}</span>
      </div>
      <div class="protected-area-popup__designation">${designation}</div>
      <div class="protected-area-popup__details">
        <div class="protected-area-popup__row">
          <span class="protected-area-popup__label">IUCN Category</span>
          <span class="protected-area-popup__value">${iucnCat} · ${iucnName}</span>
        </div>
        ${areaFormatted ? `
        <div class="protected-area-popup__row">
          <span class="protected-area-popup__label">Area</span>
          <span class="protected-area-popup__value">${areaFormatted}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { PmTilesSource } from 'mapbox-pmtiles';
import SunCalc from 'suncalc';
import { useMapMarkers } from '../../../hooks/useMapMarkers';
import { useUserLocation } from '../../../hooks/useUserLocation';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { calculateDistance, formatDistance, formatElevation } from '../../../utils/geo';
import ImageCarousel from '../../shared/ImageCarousel';
import './styles.css';

// Register PMTiles custom source type for Mapbox GL JS
// (Mapbox doesn't have addProtocol like MapLibre, so we use setSourceType instead)
mapboxgl.Style.setSourceType(PmTilesSource.SOURCE_TYPE, PmTilesSource);

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

// Default center (world view) if no user location
const DEFAULT_CENTER = [0, 20];
const DEFAULT_ZOOM = 1.5;

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
  const hoveredParkIdRef = useRef(null); // Track hovered park for feature-state
  const hasFlownToUserRef = useRef(false); // Only fly to user location once
  const geolocateControlRef = useRef(null); // Mapbox geolocate control
  const hasTriggeredGeolocateRef = useRef(false); // Only trigger geolocate once
  const protectedAreaPopupRef = useRef(null); // Popup for protected area info
  const popupAnchorRef = useRef('bottom'); // Track current popup anchor for edge detection

  // IUCN filter state (test feature)
  const [showIucnFilter, setShowIucnFilter] = useState(false);
  const [selectedIucnCategories, setSelectedIucnCategories] = useState([
    'Ia', 'Ib', 'II', 'III', 'IV', 'V', 'VI', 'Not Reported'
  ]); // All selected by default

  // Map style state
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [mapStyle, setMapStyle] = useState('standard'); // 'standard' or 'satellite'

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

  // Calculate optimal popup anchor based on cursor position relative to viewport
  const getOptimalPopupAnchor = useCallback((point) => {
    if (!mapContainer.current) return 'bottom';

    const rect = mapContainer.current.getBoundingClientRect();
    const padding = 160; // Approximate popup height + buffer

    const nearTop = point.y < padding;
    const nearBottom = point.y > rect.height - padding;
    const nearLeft = point.x < padding;
    const nearRight = point.x > rect.width - padding;

    // Determine best anchor (popup appears opposite to anchor direction)
    if (nearTop && nearLeft) return 'top-left';
    if (nearTop && nearRight) return 'top-right';
    if (nearBottom && nearLeft) return 'bottom-left';
    if (nearBottom && nearRight) return 'bottom-right';
    if (nearTop) return 'top';
    if (nearBottom) return 'bottom';
    if (nearLeft) return 'left';
    if (nearRight) return 'right';

    return 'bottom'; // Default: popup above cursor
  }, []);

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

    // Add geolocate control for user location marker (blue pulsing dot)
    // We hide the button but keep the marker visible when triggered
    geolocateControlRef.current = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: false,
    });
    map.current.addControl(geolocateControlRef.current);

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
      // Only query if the layer exists (may not be added yet if no locations)
      if (!map.current.getLayer('location-markers')) return;
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

  // Add Protected Areas layer from PMTiles on R2
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Skip if already added
    if (map.current.getSource('protected-areas')) return;

    // Add PMTiles source (hosted on Cloudflare R2)
    // Uses mapbox-pmtiles custom source type - direct URL, no pmtiles:// prefix
    map.current.addSource('protected-areas', {
      type: PmTilesSource.SOURCE_TYPE,
      url: PROTECTED_AREAS_PMTILES_URL,
      promoteId: 'id', // Use 'id' property for feature-state
    });

    // Fill layer - colored by IUCN category
    map.current.addLayer({
      id: 'protected-areas-fill',
      type: 'fill',
      source: 'protected-areas',
      'source-layer': PROTECTED_AREAS_LAYER,
      slot: 'bottom', // Mapbox Standard: below roads and labels
      minzoom: 4,
      paint: {
        'fill-color': [
          'match',
          ['get', 'iucn_cat'],
          'Ia', IUCN_COLORS['Ia'],
          'Ib', IUCN_COLORS['Ib'],
          'II', IUCN_COLORS['II'],
          'III', IUCN_COLORS['III'],
          'IV', IUCN_COLORS['IV'],
          'V', IUCN_COLORS['V'],
          'VI', IUCN_COLORS['VI'],
          IUCN_COLORS['Not Reported'], // Default
        ],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.25, // Hover state (lighter)
          0.15, // Default state (visible as UI)
        ],
        // Emit light so colors display correctly in Mapbox Standard night mode
        'fill-emissive-strength': 1,
      },
    });

    // Border layer - subtle outline
    map.current.addLayer({
      id: 'protected-areas-border',
      type: 'line',
      source: 'protected-areas',
      'source-layer': PROTECTED_AREAS_LAYER,
      slot: 'bottom',
      minzoom: 6,
      paint: {
        'line-color': [
          'match',
          ['get', 'iucn_cat'],
          'Ia', IUCN_COLORS['Ia'],
          'Ib', IUCN_COLORS['Ib'],
          'II', IUCN_COLORS['II'],
          'III', IUCN_COLORS['III'],
          'IV', IUCN_COLORS['IV'],
          'V', IUCN_COLORS['V'],
          'VI', IUCN_COLORS['VI'],
          IUCN_COLORS['Not Reported'],
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 1.5],
        'line-opacity': 0.7,
        // Emit light so borders display correctly in night mode
        'line-emissive-strength': 1,
      },
    });

    // Hover interaction - highlight fill and show popup on hover
    map.current.on('mousemove', 'protected-areas-fill', (e) => {
      if (e.features.length > 0) {
        const feature = e.features[0];

        // Clear previous hover state
        if (hoveredParkIdRef.current !== null) {
          map.current.setFeatureState(
            { source: 'protected-areas', sourceLayer: PROTECTED_AREAS_LAYER, id: hoveredParkIdRef.current },
            { hover: false }
          );
        }

        // Set new hover state
        hoveredParkIdRef.current = feature.id;
        map.current.setFeatureState(
          { source: 'protected-areas', sourceLayer: PROTECTED_AREAS_LAYER, id: hoveredParkIdRef.current },
          { hover: true }
        );

        // Calculate optimal anchor based on cursor position
        const optimalAnchor = getOptimalPopupAnchor(e.point);

        // Recreate popup if anchor needs to change (Mapbox doesn't support changing anchor)
        if (!protectedAreaPopupRef.current || popupAnchorRef.current !== optimalAnchor) {
          // Remove existing popup
          if (protectedAreaPopupRef.current) {
            protectedAreaPopupRef.current.remove();
          }

          // Create new popup with correct anchor
          // Offset direction depends on anchor position to keep arrow pointing at cursor
          const anchorOffsets = {
            'top': [0, 10],           // Push popup down
            'bottom': [0, -10],       // Push popup up
            'left': [10, 0],          // Push popup right
            'right': [-10, 0],        // Push popup left
            'top-left': [10, 10],     // Push popup down-right
            'top-right': [-10, 10],   // Push popup down-left
            'bottom-left': [10, -10], // Push popup up-right
            'bottom-right': [-10, -10], // Push popup up-left
          };
          const offset = anchorOffsets[optimalAnchor] || [0, -10];

          protectedAreaPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'protected-area-popup-container',
            maxWidth: '300px',
            anchor: optimalAnchor,
            offset: offset,
          });
          popupAnchorRef.current = optimalAnchor;
        }

        // Update popup content and position
        const popupHTML = getProtectedAreaPopupHTML(feature.properties);
        protectedAreaPopupRef.current
          .setLngLat(e.lngLat)
          .setHTML(popupHTML);

        // Add to map if not already open
        if (!protectedAreaPopupRef.current.isOpen()) {
          protectedAreaPopupRef.current.addTo(map.current);
        }

        // Change cursor to indicate interactivity
        map.current.getCanvas().style.cursor = 'pointer';
      }
    });

    map.current.on('mouseleave', 'protected-areas-fill', () => {
      if (hoveredParkIdRef.current !== null) {
        map.current.setFeatureState(
          { source: 'protected-areas', sourceLayer: PROTECTED_AREAS_LAYER, id: hoveredParkIdRef.current },
          { hover: false }
        );
      }
      hoveredParkIdRef.current = null;

      // Remove popup
      if (protectedAreaPopupRef.current) {
        protectedAreaPopupRef.current.remove();
      }

      // Reset cursor
      map.current.getCanvas().style.cursor = '';
    });
  }, [mapLoaded]);

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

  // Fly to user location when it becomes available (only once, and only if no saved viewport)
  useEffect(() => {
    if (hasFlownToUserRef.current) return; // Only fly once
    if (map.current && userLocation && mapLoaded && !initialViewport) {
      hasFlownToUserRef.current = true;
      map.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 6,
        duration: 2000,
      });
    }
  }, [userLocation, mapLoaded, initialViewport]);

  // Trigger geolocate control to show user location marker when location is available
  useEffect(() => {
    if (hasTriggeredGeolocateRef.current) return; // Only trigger once
    if (geolocateControlRef.current && userLocation && mapLoaded) {
      hasTriggeredGeolocateRef.current = true;
      // Trigger after a short delay to ensure control is ready
      setTimeout(() => {
        geolocateControlRef.current.trigger();
      }, 100);
    }
  }, [userLocation, mapLoaded]);

  // Apply dynamic day/night lighting based on user's location
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Calculate and apply the initial light preset
    const updateLighting = () => {
      // Use user's location for accurate sun position, or default to 'day'
      const preset = userLocation
        ? getLightPreset(userLocation.latitude, userLocation.longitude)
        : 'day';
      map.current.setConfigProperty('basemap', 'lightPreset', preset);

      // Adjust protected areas opacity based on lighting
      // Daytime needs higher opacity since the map is brighter
      const isDaytime = preset === 'day' || preset === 'dawn';
      const fillOpacity = isDaytime ? 0.35 : 0.15;
      const fillHoverOpacity = isDaytime ? 0.5 : 0.25;
      const lineOpacity = isDaytime ? 0.9 : 0.7;

      // Update fill layer opacity
      if (map.current.getLayer('protected-areas-fill')) {
        map.current.setPaintProperty('protected-areas-fill', 'fill-opacity', [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          fillHoverOpacity,
          fillOpacity,
        ]);
      }

      // Update border layer opacity
      if (map.current.getLayer('protected-areas-border')) {
        map.current.setPaintProperty('protected-areas-border', 'line-opacity', lineOpacity);
      }
    };

    updateLighting();

    // Update every 5 minutes to reflect time progression
    const interval = setInterval(updateLighting, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userLocation, mapLoaded]);

  // Apply IUCN category filter when selection changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (!map.current.getLayer('protected-areas-fill')) return;

    // If no categories selected, hide all zones
    if (selectedIucnCategories.length === 0) {
      // Use a filter that matches nothing
      map.current.setFilter('protected-areas-fill', ['==', ['get', 'iucn_cat'], '__none__']);
      map.current.setFilter('protected-areas-border', ['==', ['get', 'iucn_cat'], '__none__']);
      return;
    }

    // If all categories selected, remove filter (show all)
    const allCategories = ['Ia', 'Ib', 'II', 'III', 'IV', 'V', 'VI', 'Not Reported'];
    const allSelected = allCategories.every(cat => selectedIucnCategories.includes(cat));

    if (allSelected) {
      map.current.setFilter('protected-areas-fill', null);
      map.current.setFilter('protected-areas-border', null);
    } else {
      const filter = ['in', ['get', 'iucn_cat'], ['literal', selectedIucnCategories]];
      map.current.setFilter('protected-areas-fill', filter);
      map.current.setFilter('protected-areas-border', filter);
    }
  }, [selectedIucnCategories, mapLoaded]);

  // Toggle IUCN category selection
  const handleIucnToggle = useCallback((category) => {
    setSelectedIucnCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  }, []);

  // IUCN category labels for display
  const IUCN_LABELS = {
    'Ia': 'Strict Nature Reserve',
    'Ib': 'Wilderness Area',
    'II': 'National Park',
    'III': 'Natural Monument',
    'IV': 'Habitat Management',
    'V': 'Protected Landscape',
    'VI': 'Sustainable Use',
    'Not Reported': 'Not Reported',
  };

  // Map style options
  const MAP_STYLES = {
    standard: {
      url: 'mapbox://styles/mapbox/standard',
      label: 'Standard',
      icon: 'fa-map',
    },
    satellite: {
      url: 'mapbox://styles/mapbox/satellite-streets-v12',
      label: 'Satellite',
      icon: 'fa-satellite',
    },
  };

  // Handle map style change
  const handleStyleChange = useCallback((styleKey) => {
    if (!map.current || styleKey === mapStyle) return;

    // Save current camera position before style change
    const savedCamera = {
      center: map.current.getCenter(),
      zoom: map.current.getZoom(),
      bearing: map.current.getBearing(),
      pitch: map.current.getPitch(),
    };

    setMapStyle(styleKey);
    setShowStylePicker(false);

    // Change the map style - this removes all custom layers
    map.current.setStyle(MAP_STYLES[styleKey].url);

    // Re-add layers after style loads
    map.current.once('style.load', () => {
      // Restore camera position using jumpTo (atomic operation)
      map.current.jumpTo(savedCamera);

      // Re-apply light preset for standard style
      if (styleKey === 'standard' && userLocation) {
        const preset = getLightPreset(userLocation.latitude, userLocation.longitude);
        map.current.setConfigProperty('basemap', 'lightPreset', preset);
      }

      // Re-add terrain
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      }

      // Trigger re-add of protected areas and markers by toggling mapLoaded
      setMapLoaded(false);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [mapStyle, userLocation]);

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

      {/* Map Controls */}
      <div className="explore-map__controls">
        {/* IUCN Filter */}
        <div className="explore-map__control">
          <button
            className="explore-map__control-btn"
            onClick={() => {
              setShowIucnFilter(!showIucnFilter);
              setShowStylePicker(false);
            }}
          >
            <i className="fa-solid fa-layer-group"></i>
            <span>Zones</span>
            <i className={`fa-solid fa-chevron-${showIucnFilter ? 'up' : 'down'}`}></i>
          </button>

          {showIucnFilter && (
            <div className="explore-map__dropdown">
              {Object.entries(IUCN_LABELS).map(([code, label]) => (
                <label key={code} className="explore-map__dropdown-option">
                  <input
                    type="checkbox"
                    checked={selectedIucnCategories.includes(code)}
                    onChange={() => handleIucnToggle(code)}
                  />
                  <span
                    className="explore-map__iucn-color"
                    style={{ backgroundColor: IUCN_COLORS[code] }}
                  />
                  <span className="explore-map__dropdown-label">{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Style Picker */}
        <div className="explore-map__control">
          <button
            className="explore-map__control-btn"
            onClick={() => {
              setShowStylePicker(!showStylePicker);
              setShowIucnFilter(false);
            }}
          >
            <i className={`fa-solid ${MAP_STYLES[mapStyle].icon}`}></i>
            <span>{MAP_STYLES[mapStyle].label}</span>
            <i className={`fa-solid fa-chevron-${showStylePicker ? 'up' : 'down'}`}></i>
          </button>

          {showStylePicker && (
            <div className="explore-map__dropdown">
              {Object.entries(MAP_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  className={`explore-map__dropdown-option ${mapStyle === key ? 'explore-map__dropdown-option--active' : ''}`}
                  onClick={() => handleStyleChange(key)}
                >
                  <i className={`fa-solid ${style.icon}`}></i>
                  <span className="explore-map__dropdown-label">{style.label}</span>
                  {mapStyle === key && <i className="fa-solid fa-check"></i>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
