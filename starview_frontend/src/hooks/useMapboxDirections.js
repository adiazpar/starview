/**
 * useMapboxDirections Hook
 *
 * Fetches driving directions using a cascade fallback pattern:
 * 1. Mapbox Directions API (real-time traffic data)
 * 2. Backend proxy to OpenRouteService (API key kept server-side for security)
 * 3. Geodesic straight line (last resort when APIs fail)
 *
 * Returns route geometry for map display, plus duration/distance when available.
 */

import { useState, useCallback, useRef } from 'react';
import { getDirections as getDirectionsFromBackend } from '../services/directions';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Route cache configuration
const ROUTE_CACHE_PREFIX = 'starview_route_';
const ROUTE_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const ROUTE_CACHE_MAX_ENTRIES = 20; // Max routes to cache (LRU eviction)

/**
 * Generate a cache key for a route based on coordinates.
 * Rounds to 4 decimal places (~11m accuracy) to handle GPS variance.
 */
function getRouteCacheKey(from, to) {
  const round = (n) => Math.round(n * 10000) / 10000;
  return `${ROUTE_CACHE_PREFIX}${round(from.latitude)}_${round(from.longitude)}_${round(to.latitude)}_${round(to.longitude)}`;
}

/**
 * Get all route cache entries from localStorage.
 * Returns array of { key, timestamp } sorted by timestamp (oldest first).
 */
function getAllRouteCacheEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ROUTE_CACHE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          entries.push({ key, timestamp: data.timestamp || 0 });
        } catch {
          // Invalid entry, mark for cleanup
          entries.push({ key, timestamp: 0 });
        }
      }
    }
  } catch {
    // Silently fail - cache read errors are non-critical
  }
  // Sort oldest first (for LRU eviction)
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get cached route from localStorage if not expired.
 * Updates access timestamp for LRU tracking.
 */
function getCachedRoute(from, to) {
  try {
    const key = getRouteCacheKey(from, to);
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const { routeData, timestamp } = JSON.parse(cached);

    // Check if expired
    if (Date.now() - timestamp > ROUTE_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }

    // Update timestamp on access (LRU: recently accessed items stay longer)
    const updatedEntry = { routeData, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(updatedEntry));

    return routeData;
  } catch {
    return null;
  }
}

/**
 * Save route to localStorage with timestamp.
 * Implements LRU eviction when cache exceeds max entries.
 */
function setCachedRoute(from, to, routeData) {
  try {
    const key = getRouteCacheKey(from, to);

    // Check if we need to evict old entries (LRU)
    const entries = getAllRouteCacheEntries();
    const existingEntry = entries.find(e => e.key === key);

    // If this is a new entry and we're at capacity, evict oldest
    if (!existingEntry && entries.length >= ROUTE_CACHE_MAX_ENTRIES) {
      const entriesToRemove = entries.length - ROUTE_CACHE_MAX_ENTRIES + 1;
      for (let i = 0; i < entriesToRemove; i++) {
        localStorage.removeItem(entries[i].key);
      }
    }

    const cacheEntry = {
      routeData,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheEntry));
  } catch {
    // localStorage might be full or disabled (incognito mode)
  }
}

/**
 * Calculate geodesic (great circle) line between two points.
 * Used as fallback when routing APIs are unavailable.
 */
function calculateGeodesicLine(from, to, numPoints = 100) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const lat1 = toRad(from.latitude);
  const lon1 = toRad(from.longitude);
  const lat2 = toRad(to.latitude);
  const lon2 = toRad(to.longitude);

  const coordinates = [];

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;

    // Spherical interpolation (great circle)
    const d = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
    );

    if (d === 0) {
      coordinates.push([toDeg(lon1), toDeg(lat1)]);
      continue;
    }

    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);

    coordinates.push([toDeg(lon), toDeg(lat)]);
  }

  return {
    type: 'LineString',
    coordinates,
  };
}

/**
 * Calculate straight-line distance between two points (Haversine formula).
 * Returns distance in meters.
 */
function calculateHaversineDistance(from, to) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get detour factor based on straight-line distance.
 * Research shows driving distance is typically 1.2-1.5x straight-line distance,
 * with shorter distances having higher detour factors due to local road patterns.
 *
 * Sources:
 * - Nature: "How much longer do you have to drive than the crow flies?" (2024)
 * - SAGE: "Road network distances and detours in Europe" (2024)
 *
 * @param {number} straightLineMeters - Straight-line distance in meters
 * @returns {number} - Detour factor to multiply distance by
 */
function getDetourFactor(straightLineMeters) {
  const km = straightLineMeters / 1000;

  if (km < 5) {
    // Short distances: higher detour due to local road patterns
    return 1.5;
  } else if (km < 50) {
    // Medium distances: average detour
    return 1.35;
  } else {
    // Long distances: routes tend to straighten out on highways
    return 1.25;
  }
}

/**
 * Estimate average driving speed based on distance.
 * Longer trips tend to use highways with higher average speeds.
 *
 * @param {number} distanceMeters - Estimated driving distance in meters
 * @returns {number} - Average speed in km/h
 */
function getAverageSpeed(distanceMeters) {
  const km = distanceMeters / 1000;

  if (km < 10) {
    // Short urban trips: slower due to traffic, stops
    return 35;
  } else if (km < 50) {
    // Medium trips: mix of urban and suburban roads
    return 50;
  } else if (km < 200) {
    // Longer trips: more highway driving
    return 70;
  } else {
    // Very long trips: predominantly highway
    return 85;
  }
}

export function useMapboxDirections() {
  const [routeData, setRouteData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache last route to avoid recalculating when user cancels and re-navigates
  const routeCacheRef = useRef(null);

  const getRoute = useCallback(async (from, to) => {
    // Check in-memory cache first (fastest)
    if (routeCacheRef.current) {
      const cache = routeCacheRef.current;
      const sameFrom = cache.from.latitude === from.latitude &&
                       cache.from.longitude === from.longitude;
      const sameTo = cache.to.latitude === to.latitude &&
                     cache.to.longitude === to.longitude;

      if (sameFrom && sameTo) {
        setRouteData(cache.routeData);
        return cache.routeData;
      }
    }

    // Check localStorage cache (persists across refreshes)
    const localCached = getCachedRoute(from, to);
    if (localCached) {
      // Also store in memory for faster subsequent access
      routeCacheRef.current = { from, to, routeData: localCached };
      setRouteData(localCached);
      return localCached;
    }

    setIsLoading(true);
    setError(null);

    // Track if APIs responded successfully but found no route (vs network error)
    let apiRespondedNoRoute = false;

    try {
      // === Try Mapbox Directions first (better traffic data) ===
      if (MAPBOX_TOKEN) {
        try {
          const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
          const mapboxResponse = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?` +
            `access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
          );

          if (mapboxResponse.ok) {
            const data = await mapboxResponse.json();
            if (data.routes && data.routes[0]) {
              const route = data.routes[0];

              const result = {
                geometry: route.geometry,
                duration: route.duration || 0,
                distance: route.distance || 0,
                isEstimated: false,
                noRouteFound: false,
              };
              // Cache the route (memory + localStorage)
              routeCacheRef.current = { from, to, routeData: result };
              setCachedRoute(from, to, result);
              setRouteData(result);
              setIsLoading(false);
              return result;
            } else {
              // API responded but no route found (e.g., overseas destination)
              apiRespondedNoRoute = true;
            }
          }
        } catch {
          // Mapbox failed, will try ORS
        }
      }

      // === Fallback to OpenRouteService via backend proxy (API key kept server-side) ===
      try {
        const data = await getDirectionsFromBackend(from, to);
        if (data.features && data.features[0]) {
          const route = data.features[0];
          const summary = route.properties?.summary || {};

          const result = {
            geometry: route.geometry,
            duration: summary.duration || 0,
            distance: summary.distance || 0,
            isEstimated: false,
            noRouteFound: false,
          };
          // Cache the route (memory + localStorage)
          routeCacheRef.current = { from, to, routeData: result };
          setCachedRoute(from, to, result);
          setRouteData(result);
          setIsLoading(false);
          return result;
        } else {
          // API responded but no route found
          apiRespondedNoRoute = true;
        }
      } catch {
        // Backend proxy failed, will use geodesic fallback
      }

      // === Last resort: Geodesic straight line ===
      // If APIs explicitly said "no route", flag it as impossible rather than estimated
      const geometry = calculateGeodesicLine(from, to);
      const straightLineDistance = calculateHaversineDistance(from, to);

      // Apply detour factor based on distance (research: driving is 1.25-1.5x straight-line)
      const detourFactor = getDetourFactor(straightLineDistance);
      const estimatedDistance = straightLineDistance * detourFactor;

      // Estimate duration using variable speed based on trip length
      const avgSpeedKmh = getAverageSpeed(estimatedDistance);
      const estimatedDuration = (estimatedDistance / 1000) / avgSpeedKmh * 3600;

      const result = {
        geometry,
        duration: apiRespondedNoRoute ? null : estimatedDuration,
        distance: apiRespondedNoRoute ? null : estimatedDistance,
        isEstimated: !apiRespondedNoRoute,
        noRouteFound: apiRespondedNoRoute,
      };
      // Cache the route (memory + localStorage)
      routeCacheRef.current = { from, to, routeData: result };
      setCachedRoute(from, to, result);
      setRouteData(result);
      setIsLoading(false);
      return result;

    } catch {
      setError('Unable to get directions. Please try again.');
      setIsLoading(false);
      return null;
    }
  }, []);

  const clearRoute = useCallback(() => {
    setRouteData(null);
    setError(null);
  }, []);

  return { getRoute, routeData, isLoading, error, clearRoute };
}
