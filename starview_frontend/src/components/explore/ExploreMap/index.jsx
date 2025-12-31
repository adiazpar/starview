/* ExploreMap Component
 * Interactive Mapbox map displaying stargazing locations.
 * Uses native symbol layers for smooth marker rendering.
 * Bottom card slides up when marker is tapped (Airbnb-style).
 *
 * Features:
 * - Dynamic day/night lighting based on user's local sun position
 * - All card data comes from map_geojson endpoint (no extra API calls)
 * - Global protected areas layer from WDPA (colored by IUCN category)
 */

// Protected Areas PMTiles Configuration
// PMTiles file hosted on Cloudflare R2, contains 270K+ protected areas globally
const PROTECTED_AREAS_PMTILES_URL = 'https://media.starview.app/data/protected-areas.pmtiles';
const PROTECTED_AREAS_LAYER = 'protected_areas'; // Layer name set by tippecanoe -l flag
const PROTECTED_AREAS_MINZOOM = 5; // Used for both layer minzoom and popup zoom check

// Card layout values are defined in CSS (--card-margin, --card-aspect-ratio, --card-content-height)
// and read dynamically via getComputedStyle() to avoid duplication

// Animation timing (ms)
const CARD_CLOSE_ANIMATION_MS = 300;
const CARD_SWITCH_ANIMATION_MS = 150;
const FLYTO_DURATION_MS = 800;
const INITIAL_FLYTO_DURATION_MS = 2500;

// Other constants
const POPUP_EDGE_PADDING = 160;
const CLUSTER_ZOOM_BUMP = 0.5;
const GEOLOCATE_TRIGGER_DELAY_MS = 100;
const LIGHTING_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const USER_LOCATION_ZOOM = 6;

// Marker colors (Tailwind palette)
// Regular markers change based on lighting: black in day/dawn, white in night/dusk
const MARKER_COLORS = {
  selected: '#f59e0b',      // amber-500
  selectedStroke: '#fbbf24', // amber-400
  favorited: '#ec4899',     // pink-500
  // Day/dawn: black markers with white stroke for visibility on bright map
  regularDay: '#000000',
  strokeDay: '#ffffff',
  // Night/dusk: white markers with black stroke for visibility on dark map
  regularNight: '#ffffff',
  strokeNight: '#000000',
  // Cluster stroke (always white, clusters don't change with lighting)
  clusterStroke: '#ffffff',
};

// Marker sizing
const MARKER_RADIUS = 12;
const MARKER_STROKE_WIDTH = 2;
const CLUSTER_STROKE_WIDTH = 3;

// Popup anchor offsets - direction depends on anchor position to keep arrow pointing at target
const POPUP_ANCHOR_OFFSETS = {
  'top': [0, 10],           // Push popup down
  'bottom': [0, -10],       // Push popup up
  'left': [10, 0],          // Push popup right
  'right': [-10, 0],        // Push popup left
  'top-left': [10, 10],     // Push popup down-right
  'top-right': [-10, 10],   // Push popup down-left
  'bottom-left': [10, -10], // Push popup up-right
  'bottom-right': [-10, -10], // Push popup up-left
};

// Marker popup has slightly larger offsets due to marker radius
const MARKER_POPUP_ANCHOR_OFFSETS = {
  'top': [0, 10], 'bottom': [0, -15], 'left': [15, 0], 'right': [-15, 0],
  'top-left': [10, 10], 'top-right': [-10, 10],
  'bottom-left': [10, -10], 'bottom-right': [-10, -10],
};

// IUCN category colors for protected areas
// Full spectrum from warm to cool, ordered by protection strictness
const IUCN_COLORS = {
  'Ia': '#f43f5e', // Strict Nature Reserve - Rose
  'Ib': '#f97316', // Wilderness Area - Orange
  'II': '#eab308', // National Park - Yellow
  'III': '#22c55e', // Natural Monument - Green
  'IV': '#14b8a6', // Habitat Management - Teal
  'V': '#3b82f6', // Protected Landscape - Blue
  'VI': '#a855f7', // Sustainable Use - Purple
  'Not Reported': '#9ca3af', // Unknown - Gray
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

/**
 * Generate HTML content for location marker hover popup
 */
function getMarkerPopupHTML(properties) {
  const name = properties.name || 'Unknown Location';
  const region = properties.region || '';
  const rating = properties.avg_rating;
  const reviewCount = properties.review_count || 0;
  const isFavorited = properties.is_favorited;
  const locationType = properties.location_type_display || 'Viewpoint';

  // Format rating display
  const ratingHTML = rating
    ? `<i class="fa-solid fa-star"></i> ${rating.toFixed(1)} <span class="marker-popup__reviews">(${reviewCount})</span>`
    : `<span class="marker-popup__no-rating">No reviews yet</span>`;

  return `
    <div class="marker-popup">
      <div class="marker-popup__type">${locationType}</div>
      <div class="marker-popup__name">${name}</div>
      ${region ? `<div class="marker-popup__region">${region}</div>` : ''}
      <div class="marker-popup__meta">
        <span class="marker-popup__rating ${!rating ? 'marker-popup__rating--empty' : ''}">${ratingHTML}</span>
        ${isFavorited ? '<span class="marker-popup__favorite"><i class="fa-solid fa-heart"></i></span>' : ''}
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
import { useMapboxDirections } from '../../../hooks/useMapboxDirections';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { useAnimatedDropdown } from '../../../hooks/useAnimatedDropdown';
import { calculateDistance, formatDistance, formatElevation } from '../../../utils/geo';
import { formatDuration, formatDistance as formatRouteDistance } from '../../../utils/navigation';
import { useToast } from '../../../contexts/ToastContext';
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

// Cluster configuration - edit colors here to experiment
const CLUSTER_CONFIG = {
  radius: 50,           // Cluster radius in pixels
  maxZoom: 14,          // Stop clustering at this zoom level
  // Cluster circle colors by size
  colors: {
    small: '#3b82f6',   // 2-9 locations (blue-500)
    medium: '#8b5cf6',  // 10-49 locations (violet-500)
    large: '#ec4899',   // 50+ locations (pink-500)
  },
  // Cluster circle sizes by count
  sizes: {
    small: 20,          // 2-9 locations
    medium: 28,         // 10-49 locations
    large: 36,          // 50+ locations
  },
};

// Location type icons - Paste full SVG from FontAwesome
// To change: fontawesome.com → find icon → copy SVG → paste here
const LOCATION_TYPE_ICONS = {
  // Moon
  dark_sky_site: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>`,
  
  // Gopuram
  observatory: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M120 0c13.3 0 24 10.7 24 24l0 8 40 0 0-8c0-13.3 10.7-24 24-24s24 10.7 24 24l0 8 48 0 0-8c0-13.3 10.7-24 24-24s24 10.7 24 24l0 8 40 0 0-8c0-13.3 10.7-24 24-24s24 10.7 24 24l0 136c26.5 0 48 21.5 48 48l0 80c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48l-48 0 0-224-32 0 0-128-48 0 0 128 32 0 0 224-224 0 0-224 32 0 0-128-48 0 0 128-32 0 0 224-48 0c-26.5 0-48-21.5-48-48L0 336c0-26.5 21.5-48 48-48l0-80c0-26.5 21.5-48 48-48L96 24c0-13.3 10.7-24 24-24zM256 208c-17.7 0-32 14.3-32 32l0 48 64 0 0-48c0-17.7-14.3-32-32-32zM208 400l0 64 96 0 0-64c0-26.5-21.5-48-48-48s-48 21.5-48 48zM256 96c-17.7 0-32 14.3-32 32l0 32 64 0 0-32c0-17.7-14.3-32-32-32z"/></svg>`,
  
  // Campsite
  campground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M344.8 52.3c11.2-13.7 9.2-33.8-4.5-45s-33.8-9.2-45 4.5l-39.2 48-39.2-48C205.6-1.9 185.4-4 171.7 7.2s-15.7 31.4-4.5 45l47.4 58-202 246.9C4.5 367.1 0 379.6 0 392.6L0 432c0 26.5 21.5 48 48 48l416 0c26.5 0 48-21.5 48-48l0-39.4c0-12.9-4.5-25.5-12.7-35.5l-202-246.9 47.4-58zM256 288l112 128-224 0 112-128z"/></svg>`,
  
  // Binoculars
  viewpoint: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M128 32l32 0c17.7 0 32 14.3 32 32l0 32-96 0 0-32c0-17.7 14.3-32 32-32zm64 96l0 320c0 17.7-14.3 32-32 32L32 480c-17.7 0-32-14.3-32-32l0-59.1c0-34.6 9.4-68.6 27.2-98.3 13.7-22.8 22.5-48.2 25.8-74.6L60.5 156c2-16 15.6-28 31.8-28l99.8 0zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6 17.8 29.7 27.2 63.7 27.2 98.3l0 59.1c0 17.7-14.3 32-32 32l-128 0c-17.7 0-32-14.3-32-32l0-320 99.8 0zM320 64c0-17.7 14.3-32 32-32l32 0c17.7 0 32 14.3 32 32l0 32-96 0 0-32zm-32 64l0 160-64 0 0-160 64 0z"/></svg>`,
  
  // Location Dot
  other: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M0 188.6C0 84.4 86 0 192 0S384 84.4 384 188.6c0 119.3-120.2 262.3-170.4 316.8-11.8 12.8-31.5 12.8-43.3 0-50.2-54.5-170.4-197.5-170.4-316.8zM192 256a64 64 0 1 0 0-128 64 64 0 1 0 0 128z"/></svg>`,
};

/**
 * Parse SVG string and extract viewBox and path for rendering
 */
function parseSvgIcon(svgString) {
  const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
  const pathMatch = svgString.match(/d="([^"]+)"/);
  return {
    viewBox: viewBoxMatch ? viewBoxMatch[1] : '0 0 512 512',
    path: pathMatch ? pathMatch[1] : '',
  };
}

/**
 * Load a FontAwesome icon as a Mapbox image
 * Accepts full SVG string, parses it, and converts to canvas ImageData
 * @param {string} svgString - Full SVG markup
 * @param {number} size - Icon size in pixels
 * @param {string} fillColor - Fill color for the icon path
 */
function loadIconImage(svgString, size = 24, fillColor = 'white') {
  return new Promise((resolve) => {
    const { path, viewBox } = parseSvgIcon(svgString);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}"><path fill="${fillColor}" d="${path}"/></svg>`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      resolve(ctx.getImageData(0, 0, size, size));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}


function ExploreMap({ initialViewport, onViewportChange }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markerMapRef = useRef(new Map()); // O(1) lookup map for markers
  const selectedIdRef = useRef(null); // Track selected ID for click handler
  const userLocationRef = useRef(null); // For accessing location in event handlers
  const navigationModeRef = useRef(false); // Track navigation mode for click handler
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isCardVisible, setIsCardVisible] = useState(false); // Controls animation
  const [isSwitching, setIsSwitching] = useState(false); // Fade vs slide animation
  const [isNavigationMode, setIsNavigationMode] = useState(false); // Navigation UI transformation
  const hoveredParkIdRef = useRef(null); // Track hovered park for feature-state
  const hasFlownToUserRef = useRef(false); // Only fly to user location once
  const geolocateControlRef = useRef(null); // Mapbox geolocate control
  const hasTriggeredGeolocateRef = useRef(false); // Only trigger geolocate once
  const protectedAreaPopupRef = useRef(null); // Popup for protected area info
  const markerPopupRef = useRef(null); // Popup for location marker hover
  const markerPopupAnchorRef = useRef('bottom'); // Track marker popup anchor
  const popupAnchorRef = useRef('bottom'); // Track current popup anchor for edge detection
  const controlsRef = useRef(null); // Ref for map controls (click-outside detection)
  const dropdownOpenRef = useRef(false); // Track if any dropdown is open (for popup suppression)

  // IUCN filter dropdown state
  const iucnDropdown = useAnimatedDropdown();
  const [selectedIucnCategories, setSelectedIucnCategories] = useState([
    'Ia', 'Ib', 'II', 'III', 'IV', 'V', 'VI', 'Not Reported'
  ]); // All selected by default

  // Map style picker dropdown state
  const styleDropdown = useAnimatedDropdown();
  const [mapStyle, setMapStyle] = useState('standard'); // 'standard' or 'satellite'

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target)) {
        iucnDropdown.close();
        styleDropdown.close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [iucnDropdown, styleDropdown]);

  // Keep dropdown ref in sync for popup suppression
  useEffect(() => {
    dropdownOpenRef.current = iucnDropdown.isOpen || styleDropdown.isOpen;
  }, [iucnDropdown.isOpen, styleDropdown.isOpen]);

  const { geojson, markers, markerMap, isLoading, isError } = useMapMarkers();
  const { location: userLocation, source: userLocationSource } = useUserLocation();
  const { getRoute, routeData, isLoading: isRouteLoading, clearRoute } = useMapboxDirections();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const { showToast } = useToast();

  // Update selectedLocation when markers change (keeps card in sync with cache)
  useEffect(() => {
    if (selectedLocation && markerMap.size > 0) {
      // O(1) lookup using markerMap instead of .find()
      const updatedMarker = markerMap.get(selectedLocation.id);
      if (updatedMarker && updatedMarker.is_favorited !== selectedLocation.is_favorited) {
        setSelectedLocation(updatedMarker);
      }
    }
  }, [markerMap, selectedLocation]);

  // Consolidated ref sync - all refs updated in single effect to reduce render cycles
  useEffect(() => {
    markerMapRef.current = markerMap;
    selectedIdRef.current = selectedLocation?.id || null;
    userLocationRef.current = userLocation;
    navigationModeRef.current = isNavigationMode;
  }, [markerMap, selectedLocation?.id, userLocation, isNavigationMode]);

  // Calculate optimal popup anchor based on cursor position relative to viewport
  const getOptimalPopupAnchor = useCallback((point) => {
    if (!mapContainer.current) return 'bottom';

    const rect = mapContainer.current.getBoundingClientRect();
    const padding = POPUP_EDGE_PADDING;

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

  // Helper to close all map popups
  const closeMapPopups = useCallback(() => {
    if (protectedAreaPopupRef.current) {
      protectedAreaPopupRef.current.remove();
    }
    if (markerPopupRef.current) {
      markerPopupRef.current.remove();
    }
  }, []);

  // Memoize event handlers to prevent recreating on every render
  const handleCloseCard = useCallback(() => {
    // Clear selected marker's feature-state
    if (map.current && selectedIdRef.current !== null) {
      map.current.setFeatureState(
        { source: 'locations', id: selectedIdRef.current },
        { selected: false }
      );
    }
    setIsCardVisible(false);
    setIsNavigationMode(false);
    clearRoute();
    setTimeout(() => setSelectedLocation(null), CARD_CLOSE_ANIMATION_MS);
  }, [clearRoute]);

  const handleViewLocation = useCallback(() => {
    if (selectedLocation) {
      // TODO: Navigate to location detail page
    }
  }, [selectedLocation]);

  // Handle favorite toggle - redirects to login if not authenticated
  const handleToggleFavorite = useCallback((e) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    toggleFavorite.mutate(selectedLocation.id);
  }, [requireAuth, selectedLocation?.id, toggleFavorite]);

  // Enter navigation mode - transforms card UI and fetches route
  const handleNavigate = useCallback(async (e) => {
    e.stopPropagation();
    if (!selectedLocation) return;

    // Enter navigation mode (cancel button will be added in future iteration)
    setIsNavigationMode(true);

    // Only fetch route if we have precise browser geolocation (not profile fallback)
    if (userLocation && userLocationSource === 'browser') {
      const from = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      };
      const to = {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      };
      await getRoute(from, to);
    }
  }, [selectedLocation, userLocation, userLocationSource, getRoute]);

  // Clear route data when exiting navigation mode
  useEffect(() => {
    if (!isNavigationMode) {
      clearRoute();
    }
  }, [isNavigationMode, clearRoute]);

  // Display route on map when routeData is available
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const ROUTE_SOURCE_ID = 'navigation-route';
    const ROUTE_LAYER_ID = 'navigation-route-line';
    const ROUTE_COLOR = '#0ea5e9'; // --info blue

    // Remove existing route layer/source if present
    if (map.current.getLayer(ROUTE_LAYER_ID)) {
      map.current.removeLayer(ROUTE_LAYER_ID);
    }
    if (map.current.getSource(ROUTE_SOURCE_ID)) {
      map.current.removeSource(ROUTE_SOURCE_ID);
    }

    // Add route if we have route data
    if (routeData?.geometry && isNavigationMode) {
      // Add route source
      map.current.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: routeData.geometry,
        },
      });

      // Add route line layer
      map.current.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-width': 4,
          'line-opacity': 1,
          'line-emissive-strength': 1.5, // Make line glow through Mapbox lighting
        },
      });

      // Center map on route using flyTo with offset (avoids fitBounds padding artifacts on globe)
      const coordinates = routeData.geometry.coordinates;
      if (coordinates.length > 0) {
        // Calculate bounds to get center and appropriate zoom
        const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        const center = bounds.getCenter();

        // Calculate zoom level to fit route (approximation based on bounds span)
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latSpan = Math.abs(ne.lat - sw.lat);
        const lngSpan = Math.abs(ne.lng - sw.lng);
        const maxSpan = Math.max(latSpan, lngSpan);

        // Approximate zoom: larger span = lower zoom
        // These values tuned for typical route distances
        let zoom;
        if (maxSpan > 10) zoom = 4;
        else if (maxSpan > 5) zoom = 5;
        else if (maxSpan > 2) zoom = 6;
        else if (maxSpan > 1) zoom = 7;
        else if (maxSpan > 0.5) zoom = 8;
        else if (maxSpan > 0.2) zoom = 9;
        else if (maxSpan > 0.1) zoom = 10;
        else if (maxSpan > 0.05) zoom = 11;
        else zoom = 12;

        // Cap at maxZoom and zoom out slightly for breathing room
        zoom = Math.min(zoom, 14);
        zoom = Math.max(zoom - 0.5, 2); // Zoom out a bit, but not below 2

        // Offset shifts viewport center: [0, -70] moves center up to account for bottom card
        map.current.flyTo({
          center: [center.lng, center.lat],
          zoom,
          offset: [0, -70],
          duration: 1000,
        });
      }
    }
  }, [routeData, isNavigationMode, mapLoaded]);

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
      ?? (userLocation ? USER_LOCATION_ZOOM : DEFAULT_ZOOM);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.standard.url,
      center: center,
      zoom: zoom,
      attributionControl: false,
      // Disable symbol collision fade animation (default 300ms)
      // This prevents cluster count labels from lingering when clusters break apart
      fadeDuration: 0,
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
        'color': 'rgba(186, 210, 235, 1)', // Lower atmosphere (white glow)
        'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
        'horizon-blend': 0.01, // Thin atmospheric glow
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
      // Don't close card when in navigation mode
      if (navigationModeRef.current) return;

      // Only query if the layer exists (may not be added yet if no locations)
      if (!map.current.getLayer('location-markers')) return;
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['location-markers'],
      });
      if (features.length === 0) {
        // Clear selected marker's feature-state
        if (selectedIdRef.current !== null) {
          map.current.setFeatureState(
            { source: 'locations', id: selectedIdRef.current },
            { selected: false }
          );
        }
        // Animate out, then unmount
        setIsCardVisible(false);
        setTimeout(() => setSelectedLocation(null), CARD_CLOSE_ANIMATION_MS);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Handle container resize - Mapbox needs to recalculate dimensions
  // Run once after map initializes (refs are stable, no need to recreate on mapLoaded changes)
  useEffect(() => {
    // Wait for map to be initialized
    if (!mapContainer.current || !map.current) return;

    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
    });

    resizeObserver.observe(mapContainer.current);

    return () => resizeObserver.disconnect();
  }, []); // Empty deps - run once, refs are stable

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
      minzoom: PROTECTED_AREAS_MINZOOM,
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
      minzoom: PROTECTED_AREAS_MINZOOM,
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 8, 0.8, 12, 1.5],
        'line-opacity': 0.7,
        // Emit light so borders display correctly in night mode
        'line-emissive-strength': 1,
      },
    });

    // Define event handlers as named functions for cleanup
    const handleProtectedAreaMouseMove = (e) => {
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

        // Don't show protected area popup if location card is visible, dropdown is open, or marker popup is visible
        if (selectedIdRef.current !== null || dropdownOpenRef.current || (markerPopupRef.current && markerPopupRef.current.isOpen())) {
          map.current.getCanvas().style.cursor = 'pointer';
          return;
        }

        // Calculate optimal anchor based on cursor position
        const optimalAnchor = getOptimalPopupAnchor(e.point);

        // Recreate popup if anchor needs to change (Mapbox doesn't support changing anchor)
        if (!protectedAreaPopupRef.current || popupAnchorRef.current !== optimalAnchor) {
          // Remove existing popup
          if (protectedAreaPopupRef.current) {
            protectedAreaPopupRef.current.remove();
          }

          // Create new popup with correct anchor
          const offset = POPUP_ANCHOR_OFFSETS[optimalAnchor] || POPUP_ANCHOR_OFFSETS['bottom'];

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
    };

    const handleProtectedAreaMouseLeave = () => {
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
    };

    // Close protected area popup when zooming past the layer's minzoom threshold
    const handleZoomForProtectedAreas = () => {
      if (map.current.getZoom() < PROTECTED_AREAS_MINZOOM) {
        if (protectedAreaPopupRef.current) {
          protectedAreaPopupRef.current.remove();
        }
        // Clear hover state since layer is no longer visible
        if (hoveredParkIdRef.current !== null) {
          map.current.setFeatureState(
            { source: 'protected-areas', sourceLayer: PROTECTED_AREAS_LAYER, id: hoveredParkIdRef.current },
            { hover: false }
          );
          hoveredParkIdRef.current = null;
        }
        // Reset cursor to default
        map.current.getCanvas().style.cursor = '';
      }
    };

    // Register event handlers
    map.current.on('mousemove', 'protected-areas-fill', handleProtectedAreaMouseMove);
    map.current.on('mouseleave', 'protected-areas-fill', handleProtectedAreaMouseLeave);
    map.current.on('zoom', handleZoomForProtectedAreas);

    // Cleanup: remove event listeners when effect re-runs or component unmounts
    return () => {
      if (map.current) {
        map.current.off('mousemove', 'protected-areas-fill', handleProtectedAreaMouseMove);
        map.current.off('mouseleave', 'protected-areas-fill', handleProtectedAreaMouseLeave);
        map.current.off('zoom', handleZoomForProtectedAreas);
      }
    };
  }, [mapLoaded]);

  // Ref to track if marker event handlers are registered (for cleanup)
  const markerHandlersRef = useRef(null);

  // Add/update markers when data changes - SEPARATED: data updates only
  useEffect(() => {
    if (!map.current || !mapLoaded || isLoading || markers.length === 0) return;

    // If source exists, just update data
    if (map.current.getSource('locations')) {
      map.current.getSource('locations').setData(geojson);
    }
  }, [geojson, mapLoaded, isLoading]);

  // Setup marker layers and event handlers - SEPARATED: one-time setup
  useEffect(() => {
    if (!map.current || !mapLoaded || markers.length === 0) return;

    // Skip if source already exists (layers already set up)
    if (map.current.getSource('locations')) return;

    // Add new source with clustering enabled
    map.current.addSource('locations', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: CLUSTER_CONFIG.maxZoom,
      clusterRadius: CLUSTER_CONFIG.radius,
      promoteId: 'id', // Enable feature-state for selection highlighting
    });

    // Load location type icons into the map (async)
    // Icons must contrast with marker fill color:
    // - Day mode: black markers → white icons
    // - Night mode: white markers → black icons
    const loadIcons = async () => {
      for (const [type, svgString] of Object.entries(LOCATION_TYPE_ICONS)) {
        // Day icons (white) - contrasts with black markers in day mode
        const dayImageData = await loadIconImage(svgString, 24, MARKER_COLORS.strokeDay);
        if (map.current && !map.current.hasImage(`icon-${type}-day`)) {
          map.current.addImage(`icon-${type}-day`, dayImageData);
        }
        // Night icons (black) - contrasts with white markers in night mode
        const nightImageData = await loadIconImage(svgString, 24, MARKER_COLORS.strokeNight);
        if (map.current && !map.current.hasImage(`icon-${type}-night`)) {
          map.current.addImage(`icon-${type}-night`, nightImageData);
        }
      }
    };
    loadIcons();

    // Add cluster circle layer (larger circles with count-based styling)
    map.current.addLayer({
      id: 'location-clusters',
      type: 'circle',
      source: 'locations',
      filter: ['has', 'point_count'], // Only show clusters
      paint: {
        // Size based on point_count
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          CLUSTER_CONFIG.sizes.small,   // Default size for 2-9
          10, CLUSTER_CONFIG.sizes.medium, // 10+ locations
          50, CLUSTER_CONFIG.sizes.large,  // 50+ locations
        ],
        // Color based on point_count
        'circle-color': [
          'step',
          ['get', 'point_count'],
          CLUSTER_CONFIG.colors.small,   // Default color for 2-9
          10, CLUSTER_CONFIG.colors.medium, // 10+ locations
          50, CLUSTER_CONFIG.colors.large,  // 50+ locations
        ],
        'circle-stroke-width': CLUSTER_STROKE_WIDTH,
        'circle-stroke-color': MARKER_COLORS.clusterStroke,
        'circle-emissive-strength': 1,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
        // Disable transitions for instant cluster disappearance
        'circle-opacity-transition': { duration: 0 },
        'circle-radius-transition': { duration: 0 },
      },
    });

    // Add cluster count label layer
    map.current.addLayer({
      id: 'location-cluster-count',
      type: 'symbol',
      source: 'locations',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-emissive-strength': 1,
        // Disable transition for instant disappearance when cluster breaks apart
        'text-opacity-transition': { duration: 0 },
      },
    });

    // Add circle layer for individual markers (unclustered points)
    // Default to day colors (black markers) - updateLighting will adjust based on sun position
    map.current.addLayer({
      id: 'location-markers',
      type: 'circle',
      source: 'locations',
      filter: ['!', ['has', 'point_count']], // Only show unclustered points
      paint: {
        'circle-radius': MARKER_RADIUS,
        // Selected: amber, Favorited: pink, Regular: day/night dynamic (default to day)
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          MARKER_COLORS.selected,
          ['get', 'is_favorited'],
          MARKER_COLORS.favorited,
          MARKER_COLORS.regularDay,
        ],
        'circle-stroke-width': MARKER_STROKE_WIDTH,
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          MARKER_COLORS.selectedStroke,
          MARKER_COLORS.strokeDay,
        ],
        // Emit light so markers stay bright in night mode
        'circle-emissive-strength': 1,
        // Align circles with map surface (not viewport) for 3D terrain integration
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    });

    // Add icon layer on top of markers (based on location_type)
    // Default to day icons (black) - updateLighting will switch to night icons when needed
    map.current.addLayer({
      id: 'location-marker-icons',
      type: 'symbol',
      source: 'locations',
      filter: ['!', ['has', 'point_count']], // Only show unclustered points
      layout: {
        'icon-image': [
          'match',
          ['get', 'location_type'],
          'dark_sky_site', 'icon-dark_sky_site-day',
          'observatory', 'icon-observatory-day',
          'campground', 'icon-campground-day',
          'viewpoint', 'icon-viewpoint-day',
          'icon-other-day', // fallback
        ],
        'icon-size': 0.5,
        'icon-allow-overlap': true,
      },
    });

    // Define named event handlers for cleanup
    const handleClusterClick = (e) => {
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['location-clusters'],
      });
      const clusterId = features[0].properties.cluster_id;

      map.current.getSource('locations').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.current.flyTo({
          center: features[0].geometry.coordinates,
          zoom: zoom + CLUSTER_ZOOM_BUMP,
          duration: FLYTO_DURATION_MS,
        });
      });
    };

    const handleClusterMouseEnter = (e) => {
      map.current.getCanvas().style.cursor = 'pointer';
      if (selectedIdRef.current !== null || dropdownOpenRef.current) return;

      const feature = e.features[0];
      const count = feature.properties.point_count;
      const coordinates = feature.geometry.coordinates.slice();

      closeMapPopups();

      markerPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: 'bottom',
        offset: [0, -10],
        className: 'cluster-popup-container',
      })
        .setLngLat(coordinates)
        .setHTML(`<div class="cluster-popup">${count} locations</div>`)
        .addTo(map.current);
    };

    const handleClusterMouseLeave = () => {
      map.current.getCanvas().style.cursor = '';
      if (markerPopupRef.current) markerPopupRef.current.remove();
    };

    // Unified click handler for both marker circles and icons
    const handleLocationSelect = (e) => {
      const feature = e.features[0];
      const id = feature.properties.id;
      const coordinates = feature.geometry.coordinates;

      iucnDropdown.close();
      styleDropdown.close();
      closeMapPopups();

      // Calculate dynamic card height for centering offset
      // Read card dimensions from CSS variables to avoid duplication
      const styles = getComputedStyle(mapContainer.current);
      const cardMargin = parseFloat(styles.getPropertyValue('--card-margin')) || 16;
      const cardAspectRatio = parseFloat(styles.getPropertyValue('--card-aspect-ratio')) || (7 / 16);
      const cardContentHeight = parseFloat(styles.getPropertyValue('--card-content-height')) || 80;

      const canvas = map.current.getCanvas();
      const cardWidth = canvas.clientWidth - (cardMargin * 2);
      const imageHeight = cardWidth * cardAspectRatio;
      const cardHeight = imageHeight + cardContentHeight;
      const offsetY = (cardHeight + cardMargin) / 2;

      // Zoom in a few levels when selecting a marker (max zoom 12)
      const currentZoom = map.current.getZoom();
      const targetZoom = Math.min(currentZoom + 2, 12);

      map.current.flyTo({
        center: coordinates,
        zoom: targetZoom,
        duration: FLYTO_DURATION_MS,
        offset: [0, -offsetY],
      });

      if (selectedIdRef.current === id) return;

      // Clear previous selection's feature-state
      if (selectedIdRef.current !== null) {
        map.current.setFeatureState(
          { source: 'locations', id: selectedIdRef.current },
          { selected: false }
        );
      }

      // Set new selection's feature-state
      map.current.setFeatureState(
        { source: 'locations', id: id },
        { selected: true }
      );

      // O(1) lookup using markerMapRef instead of .find()
      const location = markerMapRef.current.get(id);
      if (location) {
        const isAlreadyOpen = !!document.querySelector('.explore-map__card');
        if (isAlreadyOpen) {
          setIsSwitching(true);
          setIsCardVisible(false);
          setIsNavigationMode(false); // Reset navigation mode when switching markers
          setTimeout(() => {
            setSelectedLocation(location);
            setIsSwitching(false);
          }, CARD_SWITCH_ANIMATION_MS);
        } else {
          setSelectedLocation(location);
        }
      }
    };

    const handleMarkerMouseEnter = (e) => {
      map.current.getCanvas().style.cursor = 'pointer';
      if (selectedIdRef.current !== null || dropdownOpenRef.current) return;
      if (protectedAreaPopupRef.current) protectedAreaPopupRef.current.remove();

      if (e.features.length > 0) {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const optimalAnchor = getOptimalPopupAnchor(e.point);

        if (!markerPopupRef.current || markerPopupAnchorRef.current !== optimalAnchor) {
          if (markerPopupRef.current) markerPopupRef.current.remove();

          const offset = MARKER_POPUP_ANCHOR_OFFSETS[optimalAnchor] || MARKER_POPUP_ANCHOR_OFFSETS['bottom'];

          markerPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'marker-popup-container',
            maxWidth: '250px',
            anchor: optimalAnchor,
            offset: offset,
          });
          markerPopupAnchorRef.current = optimalAnchor;
        }

        markerPopupRef.current
          .setLngLat(coordinates)
          .setHTML(getMarkerPopupHTML(feature.properties))
          .addTo(map.current);
      }
    };

    const handleMarkerMouseLeave = () => {
      map.current.getCanvas().style.cursor = '';
      if (markerPopupRef.current) markerPopupRef.current.remove();
    };


    // Register all event handlers
    map.current.on('click', 'location-clusters', handleClusterClick);
    map.current.on('mouseenter', 'location-clusters', handleClusterMouseEnter);
    map.current.on('mouseleave', 'location-clusters', handleClusterMouseLeave);

    // Both marker circle and icon layers share the same handlers
    const markerLayers = ['location-markers', 'location-marker-icons'];
    markerLayers.forEach(layer => {
      map.current.on('click', layer, handleLocationSelect);
      map.current.on('mouseenter', layer, handleMarkerMouseEnter);
      map.current.on('mouseleave', layer, handleMarkerMouseLeave);
    });

    // Store handlers ref for cleanup
    markerHandlersRef.current = {
      handleClusterClick,
      handleClusterMouseEnter,
      handleClusterMouseLeave,
      handleLocationSelect,
      handleMarkerMouseEnter,
      handleMarkerMouseLeave,
    };

    // Cleanup: remove event listeners
    return () => {
      if (map.current && markerHandlersRef.current) {
        const h = markerHandlersRef.current;
        map.current.off('click', 'location-clusters', h.handleClusterClick);
        map.current.off('mouseenter', 'location-clusters', h.handleClusterMouseEnter);
        map.current.off('mouseleave', 'location-clusters', h.handleClusterMouseLeave);

        ['location-markers', 'location-marker-icons'].forEach(layer => {
          map.current.off('click', layer, h.handleLocationSelect);
          map.current.off('mouseenter', layer, h.handleMarkerMouseEnter);
          map.current.off('mouseleave', layer, h.handleMarkerMouseLeave);
        });
      }
    };
  }, [mapLoaded, !!markers.length]);

  // Fly to user location when it becomes available (only once, and only if no saved viewport)
  useEffect(() => {
    if (hasFlownToUserRef.current) return; // Only fly once
    if (map.current && userLocation && mapLoaded && !initialViewport) {
      hasFlownToUserRef.current = true;
      map.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: USER_LOCATION_ZOOM,
        duration: INITIAL_FLYTO_DURATION_MS,
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
      }, GEOLOCATE_TRIGGER_DELAY_MS);
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

      // Update marker colors based on lighting
      // Day/dawn: black markers, Night/dusk: white markers
      if (map.current.getLayer('location-markers')) {
        const regularColor = isDaytime ? MARKER_COLORS.regularDay : MARKER_COLORS.regularNight;
        const strokeColor = isDaytime ? MARKER_COLORS.strokeDay : MARKER_COLORS.strokeNight;

        map.current.setPaintProperty('location-markers', 'circle-color', [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          MARKER_COLORS.selected,
          ['get', 'is_favorited'],
          MARKER_COLORS.favorited,
          regularColor,
        ]);

        map.current.setPaintProperty('location-markers', 'circle-stroke-color', [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          MARKER_COLORS.selectedStroke,
          strokeColor,
        ]);
      }

      // Update marker icons based on lighting (icons contrast with marker fill)
      // Day/dawn: white icons (on black markers), Night/dusk: black icons (on white markers)
      if (map.current.getLayer('location-marker-icons')) {
        const iconSuffix = isDaytime ? 'day' : 'night';
        map.current.setLayoutProperty('location-marker-icons', 'icon-image', [
          'match',
          ['get', 'location_type'],
          'dark_sky_site', `icon-dark_sky_site-${iconSuffix}`,
          'observatory', `icon-observatory-${iconSuffix}`,
          'campground', `icon-campground-${iconSuffix}`,
          'viewpoint', `icon-viewpoint-${iconSuffix}`,
          `icon-other-${iconSuffix}`, // fallback
        ]);
      }
    };

    updateLighting();

    // Update every 5 minutes to reflect time progression
    const interval = setInterval(updateLighting, LIGHTING_UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [userLocation, mapLoaded]);

  // All IUCN categories and selection state (used by filter effect and toggle handler)
  const allCategories = ['Ia', 'Ib', 'II', 'III', 'IV', 'V', 'VI', 'Not Reported'];
  const allSelected = allCategories.every(cat => selectedIucnCategories.includes(cat));

  // Memoize IUCN filter expression to avoid Mapbox re-parsing identical filters
  const iucnFilter = useMemo(() => {
    if (selectedIucnCategories.length === 0) {
      return ['==', ['get', 'iucn_cat'], '__none__']; // Hide all zones
    }
    if (allSelected) {
      return null; // Show all zones (no filter)
    }
    return ['in', ['get', 'iucn_cat'], ['literal', selectedIucnCategories]];
  }, [selectedIucnCategories, allSelected]);

  // Apply IUCN category filter when selection changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (!map.current.getLayer('protected-areas-fill')) return;

    map.current.setFilter('protected-areas-fill', iucnFilter);
    map.current.setFilter('protected-areas-border', iucnFilter);
  }, [iucnFilter, mapLoaded]);

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

  // Toggle all IUCN categories on/off
  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIucnCategories([]);
    } else {
      setSelectedIucnCategories(allCategories);
    }
  }, [allSelected]);

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
    styleDropdown.close();

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

      // Trigger re-add of protected areas and markers
      // Use requestAnimationFrame for smoother transition (replaces arbitrary 100ms timeout)
      setMapLoaded(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMapLoaded(true);
        });
      });
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

      {/* Left Controls - Zoom & Location */}
      <div className={`explore-map__controls explore-map__controls--left ${mapLoaded ? 'explore-map__controls--loaded' : ''}`}>
        {/* Zoom In */}
        <div className="explore-map__control" style={{ '--stagger-delay': '0.3s' }}>
          <button
            className="explore-map__control-btn"
            onClick={() => {
              if (!map.current) return;
              const currentZoom = map.current.getZoom();
              map.current.flyTo({
                zoom: Math.min(currentZoom + 2, 18), // Zoom in by 2 levels, max zoom 18
                duration: FLYTO_DURATION_MS,
              });
            }}
            aria-label="Zoom in"
          >
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>

        {/* Zoom Out */}
        <div className="explore-map__control" style={{ '--stagger-delay': '0.45s' }}>
          <button
            className="explore-map__control-btn"
            onClick={() => {
              if (!map.current) return;
              const currentZoom = map.current.getZoom();
              map.current.flyTo({
                zoom: Math.max(currentZoom - 2, 1), // Zoom out by 2 levels, min zoom 1
                duration: FLYTO_DURATION_MS,
              });
            }}
            aria-label="Zoom out"
          >
            <i className="fa-solid fa-minus"></i>
          </button>
        </div>

        {/* My Location */}
        <div className="explore-map__control" style={{ '--stagger-delay': '0.6s' }}>
          <button
            className="explore-map__control-btn"
            onClick={async () => {
              // Check permission state first
              if (navigator.permissions) {
                try {
                  const result = await navigator.permissions.query({ name: 'geolocation' });
                  if (result.state === 'denied') {
                    showToast('Location access blocked. Click the lock icon in your address bar to enable.', 'warning', 6000);
                    return;
                  }
                } catch (e) {
                  // Some browsers don't support permissions.query for geolocation
                }
              }

              // Try the Mapbox geolocate control (shows blue dot)
              if (geolocateControlRef.current) {
                geolocateControlRef.current.trigger();
              } else {
                // Fallback: use browser geolocation API directly
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    map.current?.flyTo({
                      center: [position.coords.longitude, position.coords.latitude],
                      zoom: USER_LOCATION_ZOOM,
                      duration: FLYTO_DURATION_MS,
                    });
                  },
                  (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                      showToast('Location access denied. Enable it in your browser settings.', 'warning', 6000);
                    } else {
                      showToast('Unable to get your location. Please try again.', 'error');
                    }
                  }
                );
              }
            }}
            aria-label="Go to my location"
          >
            <i className="fa-solid fa-location-crosshairs"></i>
          </button>
        </div>
      </div>

      {/* Right Controls - stagger delay: 0.3s base + 0.15s per item */}
      <div className={`explore-map__controls ${mapLoaded ? 'explore-map__controls--loaded' : ''}`} ref={controlsRef}>
        {/* IUCN Filter */}
        <div className="explore-map__control" style={{ '--stagger-delay': '0.3s' }}>
          <button
            className={`explore-map__control-btn ${iucnDropdown.isOpen ? 'explore-map__control-btn--active' : ''}`}
            onClick={() => {
              if (iucnDropdown.isOpen) {
                iucnDropdown.close();
              } else {
                iucnDropdown.open();
                styleDropdown.close();
                closeMapPopups();
              }
            }}
            aria-label="Filter zones"
          >
            <i className="fa-solid fa-layer-group"></i>
          </button>

          {iucnDropdown.isOpen && (
            <div className={`explore-map__dropdown ${iucnDropdown.isClosing ? 'explore-map__dropdown--closing' : ''}`}>
              <div className="explore-map__dropdown-hint">
                Filter protected areas by conservation category
              </div>
              <label className="explore-map__dropdown-option explore-map__dropdown-option--all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                />
                <span className="explore-map__dropdown-label">All</span>
              </label>
              {Object.entries(IUCN_NAMES).map(([code, label]) => (
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
        <div className="explore-map__control" style={{ '--stagger-delay': '0.45s' }}>
          <button
            className={`explore-map__control-btn ${styleDropdown.isOpen ? 'explore-map__control-btn--active' : ''}`}
            onClick={() => {
              if (styleDropdown.isOpen) {
                styleDropdown.close();
              } else {
                styleDropdown.open();
                iucnDropdown.close();
                closeMapPopups();
              }
            }}
            aria-label="Change map style"
          >
            <i className={`fa-solid ${MAP_STYLES[mapStyle].icon}`}></i>
          </button>

          {styleDropdown.isOpen && (
            <div className={`explore-map__dropdown ${styleDropdown.isClosing ? 'explore-map__dropdown--closing' : ''}`}>
              <div className="explore-map__dropdown-hint">
                Change map appearance
              </div>
              {Object.entries(MAP_STYLES).map(([key, style]) => (
                <label key={key} className="explore-map__dropdown-option">
                  <input
                    type="radio"
                    name="map-style"
                    checked={mapStyle === key}
                    onChange={() => handleStyleChange(key)}
                  />
                  <span className="explore-map__dropdown-label">{style.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card - Airbnb Style */}
      {selectedLocation && (
        <div
          className={`explore-map__card ${isCardVisible ? 'explore-map__card--visible' : ''} ${isSwitching ? 'explore-map__card--switching' : ''} ${isNavigationMode ? 'explore-map__card--navigation' : ''}`}
          onClick={isNavigationMode ? undefined : handleViewLocation}
        >
          {/* Image Carousel Section */}
          <div className="explore-map__card-image-container">
            <div className="explore-map__card-image-inner">
              <ImageCarousel
                images={selectedLocation.images || []}
                alt={selectedLocation.name}
                aspectRatio="16 / 7"
              />

              {/* Close Button */}
              <button
                className="explore-map__card-btn explore-map__card-btn--close"
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
                className={`explore-map__card-btn explore-map__card-btn--favorite ${selectedLocation.is_favorited ? 'active' : ''}`}
                onClick={handleToggleFavorite}
                aria-label={selectedLocation.is_favorited ? 'Remove from saved' : 'Save location'}
              >
                <i className={`fa-${selectedLocation.is_favorited ? 'solid' : 'regular'} fa-heart`}></i>
              </button>

              {/* Action Buttons - top left (navigate for all, phone/website for observatories) */}
              <div className="explore-map__card-actions">
                {/* Navigate Button - enters navigation mode */}
                <button
                  className="explore-map__card-btn"
                  onClick={handleNavigate}
                  aria-label="Get directions"
                >
                  <i className="fa-solid fa-diamond-turn-right"></i>
                </button>

                {/* Observatory-specific buttons */}
                {selectedLocation.location_type === 'observatory' && selectedLocation.type_metadata?.phone_number && (
                  <a
                    href={`tel:${selectedLocation.type_metadata.phone_number}`}
                    className="explore-map__card-btn"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Call observatory"
                  >
                    <i className="fa-solid fa-phone"></i>
                  </a>
                )}
                {selectedLocation.location_type === 'observatory' && selectedLocation.type_metadata?.website && (
                  <a
                    href={selectedLocation.type_metadata.website}
                    className="explore-map__card-btn"
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit website"
                  >
                    <i className="fa-solid fa-globe"></i>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="explore-map__card-content">
            <div className="explore-map__card-header">
              <h3 className="explore-map__card-name">{selectedLocation.name}</h3>
              <span className="explore-map__card-region">
                {getLocationSubtitle(selectedLocation)}
              </span>
            </div>

            {/* Default metadata - collapses in navigation mode */}
            <div className={`explore-map__card-meta-container ${isNavigationMode ? 'explore-map__card-meta-container--hidden' : ''}`}>
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

            {/* Navigation mode info - only render when navigating */}
            {isNavigationMode && (
              <div className="explore-map__card-route">
                {/* FROM section */}
                <div className="explore-map__card-route-from">
                  <span className="explore-map__card-route-label">FROM</span>
                  <span className="explore-map__card-route-value">
                    {userLocationSource === 'browser' ? 'Your location' : 'Location unavailable'}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="explore-map__card-route-actions">
                  <button
                    className="btn-danger btn-danger--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsNavigationMode(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary btn-primary--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement GO action
                    }}
                  >
                    GO
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Route stats - positioned top right in navigation mode */}
          {isNavigationMode && (
            <div className="explore-map__card-route-stats-badge">
              {userLocationSource === 'browser' ? (
                isRouteLoading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Calculating...</span>
                  </>
                ) : routeData ? (
                  <>
                    <div className="explore-map__card-route-duration">
                      <i className="fa-solid fa-clock"></i>
                      <span>{formatDuration(routeData.duration)}</span>
                    </div>
                    <div className="explore-map__card-route-distance">
                      <i className="fa-solid fa-road"></i>
                      <span>{formatRouteDistance(routeData.distance)}</span>
                      {routeData.isEstimated && (
                        <span className="explore-map__card-route-estimated">(est.)</span>
                      )}
                    </div>
                  </>
                ) : null
              ) : (
                <>
                  <i className="fa-solid fa-location-crosshairs"></i>
                  <span>Enable location</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ExploreMap;
