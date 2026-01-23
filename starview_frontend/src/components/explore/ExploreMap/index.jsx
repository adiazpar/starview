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

// Light Pollution Tiles Configuration
// Raster tiles generated from World Atlas 2015, hosted on Cloudflare R2
const LIGHT_POLLUTION_TILES_URL = 'https://media.starview.app/light-pollution/{z}/{x}/{y}.png';
const LIGHT_POLLUTION_MAXZOOM = 8;

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
const MARKER_ZOOM_THRESHOLD = 4;       // Zoom level for marker click
const MARKER_ZOOM_BUMP = 0.5;          // Added to threshold when zooming in
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
 * @param {Object} properties - Feature properties from PMTiles
 * @param {Function} formatAreaFn - Format function from useUnits hook
 */
function getProtectedAreaPopupHTML(properties, formatAreaFn) {
  const name = properties.name || 'Unknown Area';
  const designation = properties.desig || 'Protected Area';
  const iucnCat = properties.iucn_cat || 'Not Reported';
  const areaKm2 = properties.area_km2;
  const color = IUCN_COLORS[iucnCat] || IUCN_COLORS['Not Reported'];
  const iucnName = IUCN_NAMES[iucnCat] || iucnCat;

  // Format area with user's preferred unit system
  const areaFormatted = areaKm2 ? formatAreaFn(areaKm2) : null;

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
import { Link, useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { PmTilesSource } from 'mapbox-pmtiles';
import SunCalc from 'suncalc';
import { useMapMarkers } from '../../../hooks/useMapMarkers';
import { useLocation } from '../../../contexts/LocationContext';
import { useMapboxDirections } from '../../../hooks/useMapboxDirections';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { useAnimatedDropdown } from '../../../hooks/useAnimatedDropdown';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useUnits } from '../../../hooks/useUnits';
import { calculateDistance } from '../../../utils/geo';
import { getPlatformNavigationUrl } from '../../../utils/navigation';
import { useToast } from '../../../contexts/ToastContext';
import MapCard from './MapCard';
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

// Prewarm WebGL context and workers for faster map initialization
// This reduces initial load time by preparing resources before Map is created
mapboxgl.prewarm();

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


function ExploreMap({ initialViewport, onViewportChange, initialLightPollution = false, filters = {} }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markerMapRef = useRef(new Map()); // O(1) lookup map for markers
  const selectedIdRef = useRef(null); // Track selected ID for click handler
  const userLocationRef = useRef(null); // For accessing location in event handlers
  const navigationModeRef = useRef(false); // Track navigation mode for click handler
  const isPopupModeRef = useRef(false); // Track popup mode for event handlers
  const popupRef = useRef(null); // Ref for popup DOM element (direct position updates, no re-renders)
  const [mapLoaded, setMapLoaded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false); // Stays true once set (prevents re-animation on style changes)
  const [readyForHeavyLayers, setReadyForHeavyLayers] = useState(false); // Deferred loading after initial animation
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isCardVisible, setIsCardVisible] = useState(false); // Controls animation
  const [isSwitching, setIsSwitching] = useState(false); // Fade vs slide animation
  const [isNavigationMode, setIsNavigationMode] = useState(false); // Navigation UI transformation
  const [isPopupVisible, setIsPopupVisible] = useState(false); // Controls popup visibility (not position)
  const [isPopupClosing, setIsPopupClosing] = useState(false); // Track popup close animation
  const hoveredParkIdRef = useRef(null); // Track hovered park for feature-state
  const hasFlownToUserRef = useRef(false); // Only fly to user location once
  const initialAnimationCompleteRef = useRef(false); // Track when initial animation finishes
  const geolocateControlRef = useRef(null); // Mapbox geolocate control
  const hasTriggeredGeolocateRef = useRef(false); // Only trigger geolocate once on initial load
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
  const [showLightPollution, setShowLightPollution] = useState(initialLightPollution); // Light pollution overlay toggle

  // Viewport detection for popup mode (desktop/tablet ≥768px uses marker popup instead of bottom card)
  const isPopupMode = useMediaQuery('(min-width: 768px)');

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

  // Keep popup mode ref in sync for event handlers
  useEffect(() => {
    isPopupModeRef.current = isPopupMode;
  }, [isPopupMode]);

  // Fetch all markers - Mapbox handles viewport culling natively
  // Full dataset is cached 30 min on backend; avoids cache fragmentation from bbox queries
  const { geojson, markers, markerMap, isLoading, isError } = useMapMarkers({
    filters,
  });
  const {
    location: userLocation,
    source: userLocationSource,
    permissionState,
    requestCurrentLocation: refreshUserLocation,
  } = useLocation();
  const { getRoute, routeData, isLoading: isRouteLoading, clearRoute } = useMapboxDirections();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { formatArea } = useUnits();

  // Ref for formatArea to use in event handlers (avoids stale closures)
  const formatAreaRef = useRef(formatArea);
  useEffect(() => {
    formatAreaRef.current = formatArea;
  }, [formatArea]);

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

  // Unified close handler for popup (desktop/tablet)
  const closePopup = useCallback(() => {
    if (!isPopupModeRef.current || isPopupClosing) return;

    // Clear selected marker's feature-state
    if (map.current && selectedIdRef.current !== null) {
      map.current.setFeatureState(
        { source: 'locations', id: selectedIdRef.current },
        { selected: false }
      );
    }

    // Animate popup close
    setIsPopupClosing(true);
    setTimeout(() => {
      setSelectedLocation(null);
      setIsPopupVisible(false);
      setIsPopupClosing(false);
    }, 200);
  }, [isPopupClosing]);

  // Shared position update function for popup
  const updatePopupPosition = useCallback(() => {
    if (!map.current || !popupRef.current || !selectedLocation) return;

    const lngLat = [selectedLocation.longitude, selectedLocation.latitude];
    const point = map.current.project(lngLat);

    // Direct DOM update - no React re-render
    popupRef.current.style.left = `${point.x}px`;
    popupRef.current.style.top = `${point.y}px`;
  }, [selectedLocation]);

  // Control popup visibility based on mode
  useEffect(() => {
    if (!isPopupMode || !selectedLocation || !map.current || !mapLoaded || isNavigationMode) {
      setIsPopupVisible(false);
      return;
    }

    // Show popup
    setIsPopupVisible(true);
  }, [isPopupMode, selectedLocation, mapLoaded, isNavigationMode]);

  // Track popup position via direct DOM manipulation (no re-renders during pan/zoom)
  // This effect runs AFTER isPopupVisible changes, ensuring popup is mounted
  useEffect(() => {
    if (!isPopupMode || !selectedLocation || !map.current || !mapLoaded || !isPopupVisible) {
      return;
    }

    // Initial position - use RAF to ensure popup ref is populated after render
    const rafId = requestAnimationFrame(() => {
      updatePopupPosition();
    });

    // Position updates: direct DOM manipulation (high frequency, no re-renders)
    map.current.on('move', updatePopupPosition);

    return () => {
      cancelAnimationFrame(rafId);
      if (map.current) {
        map.current.off('move', updatePopupPosition);
      }
    };
  }, [isPopupMode, selectedLocation, mapLoaded, isPopupVisible, updatePopupPosition]);

  // Forward wheel events from popup overlay to map (enables zoom-through)
  useEffect(() => {
    if (!isPopupMode || !selectedLocation || !map.current || !popupRef.current || !isPopupVisible) {
      return;
    }

    const popupElement = popupRef.current;

    const handleWheel = (event) => {
      event.preventDefault();
      if (map.current.scrollZoom) {
        map.current.scrollZoom.wheel(event);
      }
    };

    popupElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      popupElement.removeEventListener('wheel', handleWheel);
    };
  }, [isPopupMode, selectedLocation, isPopupVisible]);

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
    // Desktop/tablet popup mode (not in navigation): use unified popup close
    if (isPopupModeRef.current && !navigationModeRef.current) {
      closePopup();
    } else {
      // Mobile or navigation mode: animate card close
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
    }
  }, [clearRoute, closePopup]);

  const handleViewLocation = useCallback(() => {
    if (selectedLocation) {
      navigate(`/locations/${selectedLocation.id}`);
    }
  }, [selectedLocation, navigate]);

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

    // Desktop/tablet: animate popup close, then slide in navigation card
    if (isPopupModeRef.current) {
      setIsPopupClosing(true);
      setTimeout(() => {
        setIsPopupClosing(false);
        setIsPopupVisible(false);
        setIsCardVisible(false); // Start card hidden for slide-up animation
        setIsNavigationMode(true);
        // Trigger slide-up animation after card mounts
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsCardVisible(true);
          });
        });
      }, 200); // Match popup fade-out animation duration
    } else {
      // Mobile: just enter navigation mode (card morphs)
      setIsNavigationMode(true);
    }

    // Only fetch route if we have precise browser geolocation (not IP fallback)
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
    } else if (permissionState === 'prompt' || permissionState === null) {
      // User hasn't been prompted for location yet - request it
      // The auto-fetch effect will get the route once permission is granted
      refreshUserLocation();
    }
  }, [selectedLocation, userLocation, userLocationSource, permissionState, refreshUserLocation, getRoute]);

  // Clear route data when exiting navigation mode
  useEffect(() => {
    if (!isNavigationMode) {
      clearRoute();
    }
  }, [isNavigationMode, clearRoute]);

  // Auto-fetch route when user location becomes available during navigation mode
  // This handles the case where user grants geolocation permission while in navigation mode
  useEffect(() => {
    if (!isNavigationMode || !selectedLocation) return;
    if (!userLocation || userLocationSource !== 'browser') return;

    // Fetch route if we don't have one yet (or if location just became available)
    const from = {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    };
    const to = {
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
    };

    getRoute(from, to);
  }, [isNavigationMode, selectedLocation, userLocation, userLocationSource, getRoute]);

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

    // Add route if we have route data (but not if route is impossible/noRouteFound)
    if (routeData?.geometry && isNavigationMode && !routeData.noRouteFound) {
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

      // NOTE: Don't set initial viewport bounds here - let first query fetch ALL markers
      // for fast initial load. Bbox filtering kicks in after user pans (via moveend handler).

      // If we have a saved viewport, no flyTo animation will occur
      // Enable heavy layers after first idle to ensure smooth initial render
      if (initialViewport) {
        map.current.once('idle', () => {
          initialAnimationCompleteRef.current = true;
          setReadyForHeavyLayers(true);
        });
      }
      // Otherwise, flyTo effect or fallback effect will enable heavy layers
    });

    // Save viewport when map moves (for sessionStorage persistence)
    map.current.on('moveend', () => {
      if (onViewportChange) {
        onViewportChange({
          center: map.current.getCenter().toArray(),
          zoom: map.current.getZoom(),
        });
      }
    });

    // Close card/popup when clicking on map (not on markers)
    map.current.on('click', (e) => {
      // Don't close when in navigation mode
      if (navigationModeRef.current) return;
      if (selectedIdRef.current === null) return;

      // Only query if the layer exists (may not be added yet if no locations)
      if (!map.current.getLayer('location-markers')) return;

      // Check both marker circles and icons (icons visible at higher zoom)
      const markerLayers = ['location-markers', 'location-marker-icons'].filter(
        layer => map.current.getLayer(layer)
      );
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: markerLayers,
      });

      // Clicked on empty map area - close popup/card
      if (features.length === 0) {
        if (isPopupModeRef.current) {
          // Desktop/tablet: animate popup close
          setIsPopupClosing(true);
          map.current.setFeatureState(
            { source: 'locations', id: selectedIdRef.current },
            { selected: false }
          );
          setTimeout(() => {
            setSelectedLocation(null);
            setIsPopupVisible(false);
            setIsPopupClosing(false);
          }, 200);
        } else {
          // Mobile: animate card slide-down
          map.current.setFeatureState(
            { source: 'locations', id: selectedIdRef.current },
            { selected: false }
          );
          setIsCardVisible(false);
          setTimeout(() => setSelectedLocation(null), CARD_CLOSE_ANIMATION_MS);
        }
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
  // Deferred until after initial animation to prevent mobile GPU stutter
  useEffect(() => {
    if (!map.current || !mapLoaded || !readyForHeavyLayers) return;

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
        'line-opacity': 0.2,
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
        const popupHTML = getProtectedAreaPopupHTML(feature.properties, formatAreaRef.current);
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
  }, [mapLoaded, readyForHeavyLayers]);

  // Add Light Pollution raster tile layer
  // Uses XYZ tiles generated from World Atlas 2015 data
  // When initialLightPollution is true, skip the readyForHeavyLayers delay
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    // Skip delay when user specifically requested light pollution view
    if (!readyForHeavyLayers && !initialLightPollution) return;
    if (map.current.getSource('light-pollution')) return;

    map.current.addSource('light-pollution', {
      type: 'raster',
      tiles: [LIGHT_POLLUTION_TILES_URL],
      tileSize: 256,
      maxzoom: LIGHT_POLLUTION_MAXZOOM,
      attribution: 'Light pollution © World Atlas 2015'
    });

    // Only specify beforeId if the layer exists (it won't when loading early)
    const beforeId = map.current.getLayer('protected-areas-fill') ? 'protected-areas-fill' : undefined;

    map.current.addLayer({
      id: 'light-pollution-layer',
      type: 'raster',
      source: 'light-pollution',
      slot: 'bottom',
      layout: {
        // Start visible if user requested light pollution view, otherwise hidden
        visibility: initialLightPollution ? 'visible' : 'none'
      },
      paint: {
        'raster-opacity': 0.7,
        // Skip transition on initial load for instant appearance, smooth transition when toggling
        'raster-opacity-transition': { duration: initialLightPollution ? 0 : 300 },
        // Boost colors to make light pollution more vibrant
        'raster-saturation': 0.4,   // Increase color intensity
        'raster-contrast': 0.3,     // Increase contrast between light/dark areas
        'raster-brightness-min': 0.1, // Lift shadows slightly
        // Emit light so colors glow through Mapbox Standard night mode
        // This makes light pollution visible as actual "light" at night
        'raster-emissive-strength': 1.2  // Increased for stronger glow
      }
    }, beforeId);

  }, [mapLoaded, readyForHeavyLayers, initialLightPollution]);

  // Toggle light pollution layer visibility
  // Skip readyForHeavyLayers check when initialLightPollution (layer loads early in that case)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (!readyForHeavyLayers && !initialLightPollution) return;
    if (!map.current.getLayer('light-pollution-layer')) return;

    map.current.setLayoutProperty(
      'light-pollution-layer',
      'visibility',
      showLightPollution ? 'visible' : 'none'
    );
  }, [showLightPollution, mapLoaded, readyForHeavyLayers, initialLightPollution]);

  // Ref to track if marker event handlers are registered (for cleanup)
  const markerHandlersRef = useRef(null);

  // Add/update markers when data changes - SEPARATED: data updates only
  // Note: Don't check markers.length here - we need to update even when empty (filters return no results)
  useEffect(() => {
    if (!map.current || !mapLoaded || isLoading) return;

    // If source exists, update data (including empty data when filters return no results)
    if (map.current.getSource('locations')) {
      map.current.getSource('locations').setData(geojson);
    }
  }, [geojson, mapLoaded, isLoading]);

  // Setup marker layers and event handlers
  // NOTE: This effect handles both layer creation AND handler registration.
  // In React Strict Mode, cleanup removes handlers but layers persist in Mapbox.
  // We must always re-register handlers even if source exists.
  useEffect(() => {
    if (!map.current || !mapLoaded || markers.length === 0) return;

    const sourceExists = !!map.current.getSource('locations');

    // Create source and layers only if they don't exist
    if (!sourceExists) {
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
    } // End of if (!sourceExists)

    // Remove any existing handlers before re-registering
    // This prevents duplicate handlers if effect runs multiple times (React Strict Mode)
    if (markerHandlersRef.current) {
      const h = markerHandlersRef.current;
      map.current.off('click', 'location-clusters', h.handleClusterClick);
      map.current.off('mouseenter', 'location-clusters', h.handleClusterMouseEnter);
      map.current.off('mouseleave', 'location-clusters', h.handleClusterMouseLeave);
      const oldMarkerLayers = ['location-markers', 'location-marker-icons'];
      map.current.off('click', oldMarkerLayers, h.handleLocationSelect);
      map.current.off('mouseenter', oldMarkerLayers, h.handleMarkerMouseEnter);
      map.current.off('mouseleave', oldMarkerLayers, h.handleMarkerMouseLeave);
    }

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

      // Zoom to threshold when far out, otherwise just center without zoom change
      // Use slower animation when very far (threshold - 1), faster when closer
      const currentZoom = map.current.getZoom();
      const targetZoom = MARKER_ZOOM_THRESHOLD + MARKER_ZOOM_BUMP;
      const shouldZoom = currentZoom < targetZoom;
      const isFarOut = currentZoom < MARKER_ZOOM_THRESHOLD - 1;

      // Desktop/tablet popup mode: center marker without offset (popup floats above)
      // Mobile: offset to keep marker visible above bottom card
      if (isPopupModeRef.current) {
        map.current.flyTo({
          center: coordinates,
          zoom: shouldZoom ? targetZoom : currentZoom,
          duration: isFarOut ? INITIAL_FLYTO_DURATION_MS : FLYTO_DURATION_MS,
          // No offset - popup floats above centered marker
        });
      } else {
        // Calculate dynamic card height for centering offset (mobile only)
        const styles = getComputedStyle(mapContainer.current);
        const cardMargin = parseFloat(styles.getPropertyValue('--card-margin')) || 16;
        const cardAspectRatio = parseFloat(styles.getPropertyValue('--card-aspect-ratio')) || (7 / 16);
        const cardContentHeight = parseFloat(styles.getPropertyValue('--card-content-height')) || 80;

        const canvas = map.current.getCanvas();
        const cardWidth = canvas.clientWidth - (cardMargin * 2);
        const imageHeight = cardWidth * cardAspectRatio;
        const cardHeight = imageHeight + cardContentHeight;
        const offsetY = (cardHeight + cardMargin) / 2;

        map.current.flyTo({
          center: coordinates,
          zoom: shouldZoom ? targetZoom : currentZoom,
          duration: isFarOut ? INITIAL_FLYTO_DURATION_MS : FLYTO_DURATION_MS,
          offset: [0, -offsetY],
        });
      }

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

      // Get location from markerMap (has pre-parsed data)
      // keepPreviousData in useMapMarkers ensures markerMap always has visible markers
      const location = markerMapRef.current.get(id);
      if (location) {
        // Check if we're switching between markers (for animation)
        const isAlreadyOpen = selectedIdRef.current !== null;
        if (isAlreadyOpen && !isPopupModeRef.current) {
          // Mobile: use switching animation
          setIsSwitching(true);
          setIsCardVisible(false);
          setIsNavigationMode(false);
          setTimeout(() => {
            setSelectedLocation(location);
            setIsSwitching(false);
          }, CARD_SWITCH_ANIMATION_MS);
        } else {
          // Desktop/tablet or first selection: instant update
          setIsNavigationMode(false);
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

    // Single handler for both marker circles and icons (more efficient than separate handlers)
    const markerLayers = ['location-markers', 'location-marker-icons'];
    map.current.on('click', markerLayers, handleLocationSelect);
    map.current.on('mouseenter', markerLayers, handleMarkerMouseEnter);
    map.current.on('mouseleave', markerLayers, handleMarkerMouseLeave);

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

        const markerLayers = ['location-markers', 'location-marker-icons'];
        map.current.off('click', markerLayers, h.handleLocationSelect);
        map.current.off('mouseenter', markerLayers, h.handleMarkerMouseEnter);
        map.current.off('mouseleave', markerLayers, h.handleMarkerMouseLeave);
      }
    };
  }, [mapLoaded, !!markers.length]);

  // Fly to user location when it becomes available (only once, and only if no saved viewport)
  // After animation completes, enable heavy layers (protected areas) for smoother initial load
  // Skip fly-to when initialLightPollution is true (user is exploring the light pollution map)
  useEffect(() => {
    if (hasFlownToUserRef.current) return; // Only fly once
    if (initialLightPollution) return; // Skip when exploring light pollution map
    if (map.current && userLocation && mapLoaded && !initialViewport) {
      hasFlownToUserRef.current = true;
      initialAnimationCompleteRef.current = false;

      map.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: USER_LOCATION_ZOOM,
        duration: INITIAL_FLYTO_DURATION_MS,
      });

      // Wait for animation to complete before loading heavy layers
      // Using 'idle' ensures both animation AND tile loading are done
      map.current.once('idle', () => {
        initialAnimationCompleteRef.current = true;
        setReadyForHeavyLayers(true);
      });
    }
  }, [userLocation, mapLoaded, initialViewport, initialLightPollution]);

  // Fallback: enable heavy layers if no flyTo occurs (user never grants geolocation)
  // This handles first-time users who dismiss the location prompt
  useEffect(() => {
    if (!map.current || !mapLoaded || readyForHeavyLayers || initialViewport) return;

    // Wait for map to become idle, then enable heavy layers
    // This fires quickly if there's no animation pending
    const handleIdle = () => {
      if (!readyForHeavyLayers && !hasFlownToUserRef.current) {
        initialAnimationCompleteRef.current = true;
        setReadyForHeavyLayers(true);
      }
    };

    map.current.once('idle', handleIdle);

    return () => {
      map.current?.off('idle', handleIdle);
    };
  }, [mapLoaded, readyForHeavyLayers, initialViewport]);

  // Trigger geolocate control to show user location marker when browser location is available
  // This runs when: 1) initial load with browser permission, 2) user grants permission mid-session
  // Uses hasTriggeredGeolocateRef to prevent re-triggering on style changes (which toggle mapLoaded)
  useEffect(() => {
    // Only trigger for browser geolocation (not IP fallback)
    if (userLocationSource !== 'browser') return;
    if (!geolocateControlRef.current || !userLocation || !mapLoaded) return;
    // Only trigger once - prevents map jumping back to user location on style changes
    if (hasTriggeredGeolocateRef.current) return;

    hasTriggeredGeolocateRef.current = true;

    // Trigger after a short delay to ensure control is ready
    setTimeout(() => {
      geolocateControlRef.current?.trigger();
    }, GEOLOCATE_TRIGGER_DELAY_MS);
  }, [userLocation, userLocationSource, mapLoaded]);

  // Set controlsVisible to true once map loads (never resets, prevents re-animation on style changes)
  useEffect(() => {
    if (mapLoaded && !controlsVisible) {
      setControlsVisible(true);
    }
  }, [mapLoaded, controlsVisible]);

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
      const lineOpacity = isDaytime ? 0.5 : 0.2;

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

      // Update light pollution layer opacity based on lighting
      // Higher opacity at night since the emissive glow effect is more prominent
      if (map.current.getLayer('light-pollution-layer')) {
        const lightPollutionOpacity = isDaytime ? 0.6 : 0.8;
        map.current.setPaintProperty('light-pollution-layer', 'raster-opacity', lightPollutionOpacity);
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
      <div className={`explore-map__controls explore-map__controls--left ${controlsVisible ? 'explore-map__controls--loaded' : ''}`}>
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
                    showToast('Location access blocked. Click the icon in your address bar to enable.', 'warning', 6000);
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
                      showToast('Location access blocked. Click the icon in your address bar to enable.', 'warning', 6000);
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
      <div className={`explore-map__controls ${controlsVisible ? 'explore-map__controls--loaded' : ''}`} ref={controlsRef}>
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

        {/* Light Pollution Toggle */}
        <div className="explore-map__control" style={{ '--stagger-delay': '0.55s' }}>
          <button
            className={`explore-map__control-btn ${showLightPollution ? 'explore-map__control-btn--active' : ''}`}
            onClick={() => setShowLightPollution(prev => !prev)}
            aria-label="Toggle light pollution overlay"
            title="Light Pollution"
          >
            <i className="fa-solid fa-lightbulb"></i>
          </button>
        </div>
      </div>

      {/* Bortle info button - bottom right, next to Mapbox attribution */}
      {showLightPollution && (
        <Link
          to="/bortle"
          className="explore-map__bortle-info"
          aria-label="Learn about the Bortle scale"
          title="What is the Bortle scale?"
        >
          <i className="fa-solid fa-circle-question"></i>
        </Link>
      )}

      {/* Desktop/Tablet: Popup variant (centered on marker) */}
      {isPopupMode && selectedLocation && isPopupVisible && !isNavigationMode && (
        <MapCard
          ref={popupRef}
          variant="popup"
          location={selectedLocation}
          userLocation={userLocation}
          isClosing={isPopupClosing}
          onClose={handleCloseCard}
          onNavigate={handleNavigate}
          onToggleFavorite={() => {
            if (!requireAuth()) return;
            toggleFavorite.mutate(selectedLocation.id);
          }}
          onViewLocation={handleViewLocation}
        />
      )}

      {/* Bottom variant: mobile always, desktop/tablet in navigation mode */}
      {((!isPopupMode && selectedLocation) || (isPopupMode && selectedLocation && isNavigationMode)) && (
        <MapCard
          variant="bottom"
          location={selectedLocation}
          userLocation={userLocation}
          isVisible={isCardVisible}
          isSwitching={isSwitching}
          isNavigationMode={isNavigationMode}
          routeData={routeData}
          isRouteLoading={isRouteLoading}
          userLocationSource={userLocationSource}
          onClose={handleCloseCard}
          onNavigate={handleNavigate}
          onToggleFavorite={handleToggleFavorite}
          onViewLocation={handleViewLocation}
          onCancelNavigation={() => setIsNavigationMode(false)}
          onGo={(e) => {
            e.stopPropagation();
            if (userLocationSource !== 'browser') {
              showToast('Location access blocked. Click the icon in your address bar to enable.', 'warning');
              return;
            }
            if (selectedLocation) {
              const url = getPlatformNavigationUrl(selectedLocation.latitude, selectedLocation.longitude);
              window.open(url, '_blank');
            }
          }}
        />
      )}
    </div>
  );
}

export default ExploreMap;
