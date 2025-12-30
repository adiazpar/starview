/**
 * Hook for fetching driving directions with cascade fallback
 *
 * Uses a cost-optimized cascade pattern:
 * 1. OpenRouteService (free: 2,000/day)
 * 2. Mapbox Directions (free: 100,000/month)
 * 3. Geodesic fallback (unlimited, estimated)
 *
 * Combined free capacity: ~160,000 requests/month
 */

import { useState, useCallback } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const ORS_API_KEY = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;

// API endpoints
// ORS GeoJSON endpoint returns geometry in GeoJSON format (not encoded polyline)
const ORS_API_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const MAPBOX_API_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

// Average driving speed for geodesic fallback (meters per second)
// ~50 mph = ~22.35 m/s (conservative estimate for mixed roads)
const AVERAGE_DRIVING_SPEED_MPS = 22.35;

/**
 * @typedef {Object} RouteData
 * @property {Object} geometry - GeoJSON LineString geometry for map display
 * @property {number} duration - Route duration in seconds
 * @property {number} distance - Route distance in meters
 * @property {'openrouteservice' | 'mapbox' | 'geodesic'} source - Which service provided the route
 * @property {boolean} isEstimated - True if using geodesic fallback (estimated, not actual route)
 */

/**
 * Calculate Haversine distance between two points
 * @returns {number} Distance in meters
 */
function haversineDistance(from, to) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate geodesic (great circle) arc between two points
 * @returns {Object} GeoJSON LineString geometry
 */
function generateGeodesicArc(from, to, numPoints = 100) {
  const coordinates = [];

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;

    // Spherical linear interpolation (slerp) for great circle path
    const lat1 = (from.latitude * Math.PI) / 180;
    const lon1 = (from.longitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const lon2 = (to.longitude * Math.PI) / 180;

    // Calculate angular distance
    const d =
      2 *
      Math.asin(
        Math.sqrt(
          Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
        )
      );

    if (d === 0) {
      coordinates.push([from.longitude, from.latitude]);
      continue;
    }

    const A = Math.sin((1 - fraction) * d) / Math.sin(d);
    const B = Math.sin(fraction * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);

    coordinates.push([(lon * 180) / Math.PI, (lat * 180) / Math.PI]);
  }

  return {
    type: 'LineString',
    coordinates,
  };
}

/**
 * Fetch route from OpenRouteService
 */
async function fetchOpenRouteService(from, to) {
  if (!ORS_API_KEY) {
    throw new Error('OpenRouteService API key not configured');
  }

  const response = await fetch(ORS_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ORS_API_KEY,
    },
    body: JSON.stringify({
      coordinates: [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ],
    }),
  });

  if (response.status === 429) {
    const error = new Error('Rate limit exceeded');
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    throw new Error('OpenRouteService request failed');
  }

  const data = await response.json();

  // GeoJSON endpoint returns FeatureCollection with features array
  if (!data.features || data.features.length === 0) {
    throw new Error('No route found');
  }

  const feature = data.features[0];
  return {
    geometry: feature.geometry,
    duration: feature.properties.summary.duration,
    distance: feature.properties.summary.distance,
    source: 'openrouteservice',
    isEstimated: false,
  };
}

/**
 * Fetch route from Mapbox Directions API
 */
async function fetchMapboxDirections(from, to) {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;

  const url = new URL(`${MAPBOX_API_BASE}/${coordinates}`);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'false');

  const response = await fetch(url);

  if (response.status === 429) {
    const error = new Error('Rate limit exceeded');
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    throw new Error('Mapbox request failed');
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found');
  }

  const route = data.routes[0];
  return {
    geometry: route.geometry,
    duration: route.duration,
    distance: route.distance,
    source: 'mapbox',
    isEstimated: false,
  };
}

/**
 * Generate geodesic fallback route (when both APIs are rate limited)
 */
function generateGeodesicFallback(from, to) {
  const distance = haversineDistance(from, to);

  // Estimate driving distance as 1.4x straight-line distance (accounts for roads)
  const estimatedDrivingDistance = distance * 1.4;

  // Estimate duration based on average speed
  const estimatedDuration = estimatedDrivingDistance / AVERAGE_DRIVING_SPEED_MPS;

  return {
    geometry: generateGeodesicArc(from, to),
    duration: estimatedDuration,
    distance: estimatedDrivingDistance,
    source: 'geodesic',
    isEstimated: true,
  };
}

/**
 * Custom hook for directions with cascade fallback
 * @returns {Object} - { getRoute, routeData, isLoading, error, clearRoute }
 */
export function useMapboxDirections() {
  const [routeData, setRouteData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch route between two coordinates using cascade pattern
   * @param {Object} from - Starting point { latitude, longitude }
   * @param {Object} to - Destination { latitude, longitude }
   * @returns {Promise<RouteData>}
   */
  const getRoute = useCallback(async (from, to) => {
    if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) {
      setError('Invalid coordinates');
      return null;
    }

    setIsLoading(true);
    setError(null);

    let result = null;

    // 1. Try OpenRouteService first (free: 2,000/day)
    // TODO: REMOVE - Temporary blockers to test cascade fallback
    const BLOCK_ORS = true;
    const BLOCK_MAPBOX = true;
    if (ORS_API_KEY && !BLOCK_ORS) {
      try {
        result = await fetchOpenRouteService(from, to);
        console.log('🗺️ Route source: OpenRouteService');
        setRouteData(result);
        setIsLoading(false);
        return result;
      } catch (err) {
        // Only cascade on rate limit (429), otherwise try next service
        if (err.status !== 429) {
          console.warn('OpenRouteService failed:', err.message);
        }
      }
    }

    // 2. Fallback to Mapbox (free: 100,000/month)
    if (!BLOCK_MAPBOX) try {
      result = await fetchMapboxDirections(from, to);
      console.log('🗺️ Route source: Mapbox Directions');
      setRouteData(result);
      setIsLoading(false);
      return result;
    } catch (err) {
      if (err.status !== 429) {
        console.warn('Mapbox Directions failed:', err.message);
      }
    }

    // 3. Final fallback: geodesic estimation
    try {
      result = generateGeodesicFallback(from, to);
      console.log('🗺️ Route source: Geodesic fallback (estimated)');
      setRouteData(result);
      setIsLoading(false);
      return result;
    } catch (err) {
      setError('Unable to calculate route');
      setRouteData(null);
      setIsLoading(false);
      return null;
    }
  }, []);

  /**
   * Clear the current route data
   */
  const clearRoute = useCallback(() => {
    setRouteData(null);
    setError(null);
  }, []);

  return {
    getRoute,
    routeData,
    isLoading,
    error,
    clearRoute,
  };
}
