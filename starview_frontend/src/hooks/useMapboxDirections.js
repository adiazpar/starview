/**
 * useMapboxDirections Hook
 *
 * Fetches driving directions using a cascade fallback pattern:
 * 1. OpenRouteService (free tier: 2,000 req/day)
 * 2. Mapbox Directions API (fallback)
 * 3. Geodesic straight line (last resort when APIs fail)
 *
 * Returns route geometry for map display, plus duration/distance when available.
 */

import { useState, useCallback } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const ORS_API_KEY = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;

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

export function useMapboxDirections() {
  const [routeData, setRouteData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const getRoute = useCallback(async (from, to) => {
    setIsLoading(true);
    setError(null);

    try {
      // === Try OpenRouteService first (free tier) ===
      if (ORS_API_KEY) {
        try {
          console.log('[Routing] Trying OpenRouteService...');
          const orsResponse = await fetch(
            'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
            {
              method: 'POST',
              headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                coordinates: [
                  [from.longitude, from.latitude],
                  [to.longitude, to.latitude],
                ],
              }),
            }
          );

          if (orsResponse.ok) {
            const data = await orsResponse.json();
            if (data.features && data.features[0]) {
              const route = data.features[0];
              const summary = route.properties?.summary || {};

              console.log('[Routing] SUCCESS: OpenRouteService');
              const result = {
                geometry: route.geometry,
                duration: summary.duration || 0,
                distance: summary.distance || 0,
                isEstimated: false,
              };
              setRouteData(result);
              setIsLoading(false);
              return result;
            }
          }
          console.log('[Routing] OpenRouteService failed, trying Mapbox...');
        } catch (orsError) {
          console.log('[Routing] OpenRouteService error:', orsError.message);
        }
      }

      // === Fallback to Mapbox Directions ===
      if (MAPBOX_TOKEN) {
        try {
          console.log('[Routing] Trying Mapbox Directions...');
          const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
          const mapboxResponse = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?` +
            `access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
          );

          if (mapboxResponse.ok) {
            const data = await mapboxResponse.json();
            if (data.routes && data.routes[0]) {
              const route = data.routes[0];

              console.log('[Routing] SUCCESS: Mapbox Directions');
              const result = {
                geometry: route.geometry,
                duration: route.duration || 0,
                distance: route.distance || 0,
                isEstimated: false,
              };
              setRouteData(result);
              setIsLoading(false);
              return result;
            }
          }
          console.log('[Routing] Mapbox failed, using geodesic fallback...');
        } catch (mapboxError) {
          console.log('[Routing] Mapbox error:', mapboxError.message);
        }
      }

      // === Last resort: Geodesic straight line ===
      console.log('[Routing] Using geodesic fallback (straight line)');
      const geometry = calculateGeodesicLine(from, to);
      const distance = calculateHaversineDistance(from, to);

      // Rough estimate: 60 km/h average driving speed
      const estimatedDuration = (distance / 1000) / 60 * 3600;

      const result = {
        geometry,
        duration: estimatedDuration,
        distance,
        isEstimated: true, // Flag to indicate this is not a real route
      };
      setRouteData(result);
      setIsLoading(false);
      return result;

    } catch (err) {
      console.error('[Routing] All methods failed:', err);
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
