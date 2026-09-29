/**
 * LocationContext
 *
 * Unified location management for the entire Starview app.
 * Location is ephemeral (session-based) enabling a "check conditions anywhere" experience.
 * Used by sky pages (Tonight, Weather, Bortle) AND Explore page for consistent location context.
 *
 * Resolution order:
 * Keep explicit search selections; refresh detected location on each visit.
 * Browser geolocation (if permission granted), then IP, otherwise unknown.
 *
 * Two location states:
 * - location: Current active location (changes with search)
 * - actualLocation: Current detected location (approximate for IP; never a search selection)
 *
 * Usage:
 *   const { location, actualLocation, source, isLoading, permissionState, setLocation, requestCurrentLocation, clearLocation } = useLocation();
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { validCoordinates } from '../utils/location';

const LocationContext = createContext(null);

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Reverse geocode coordinates to get a place name using Mapbox Geocoding API
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string|null>} Place name (e.g., "Colorado Springs, Colorado") or null if failed
 */
async function reverseGeocode(latitude, longitude) {
  if (!MAPBOX_TOKEN) return null;

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=place,locality&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const feature = data.features?.[0];

    if (feature) {
      // Extract city and region from context
      const placeName = feature.text; // City name
      const region = feature.context?.find((c) => c.id.startsWith('region'))?.text;

      if (placeName && region) {
        return `${placeName}, ${region}`;
      }
      return placeName || feature.place_name || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Only a deliberate search selection persists between page visits. Detected
// locations are refreshed so travel, permission changes and old development
// fixtures cannot masquerade as the user's current position.
const SESSION_KEY = 'starview_active_location';
const RECENT_KEY = 'starview_recent_locations';
const MAX_RECENT_LOCATIONS = 5;

function readStored(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}

function writeStored(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch { /* Location still works when browser storage is unavailable. */ }
}

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(null);
  const [actualLocation, setActualLocation] = useState(null);
  const [source, setSource] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionState, setPermissionState] = useState(null);
  const [recentLocations, setRecentLocations] = useState(() => {
    const stored = readStored(localStorage, RECENT_KEY);
    return Array.isArray(stored) ? stored.filter(validCoordinates).slice(0, MAX_RECENT_LOCATIONS) : [];
  });
  const detectionVersion = useRef(0);
  const selectionVersion = useRef(0);
  const activeSource = useRef(null);
  const permissionStatus = useRef(null);
  const currentLocationRequested = useRef(false);

  const resolveLocation = useCallback(async (tryBrowser, preserveSearch = false) => {
    const version = ++detectionVersion.current;
    const selection = selectionVersion.current;
    setIsLoading(true);
    let detected = null;
    if (tryBrowser && navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, timeout: 10000, maximumAge: 60000,
          });
        });
        const { latitude, longitude } = position.coords;
        if (validCoordinates({ latitude, longitude })) {
          const name = await reverseGeocode(latitude, longitude);
          detected = { latitude, longitude, name: name || 'Current location', source: 'browser' };
        }
      } catch { /* Permission denial and timeouts fall back to approximate IP location. */ }
    }
    if (version !== detectionVersion.current) return false;
    if (!detected) {
      try {
        const { data } = await api.get('/geolocate/', { timeout: 5000 });
        if (data.source === 'ip' && validCoordinates(data)) {
          detected = {
            latitude: data.latitude, longitude: data.longitude,
            name: [data.city, data.region].filter(Boolean).join(', ') || 'Approximate location',
            source: 'ip',
          };
        }
      } catch { /* Unknown location is a valid state; the user can search. */ }
    }
    if (version !== detectionVersion.current) return false;
    setActualLocation(detected);
    // A delayed detection may update nearby results, but must not replace a
    // location the user deliberately selected while that request was in flight.
    if (selection === selectionVersion.current && !(preserveSearch && activeSource.current === 'search')) {
      setLocationState(detected);
      setSource(detected?.source || null);
      activeSource.current = detected?.source || null;
      writeStored(sessionStorage, SESSION_KEY, null);
    }
    setIsLoading(false);
    return detected?.source === 'browser';
  }, []);

  const requestCurrentLocation = useCallback(async () => {
    currentLocationRequested.current = true;
    try {
      return await resolveLocation(true);
    } finally {
      currentLocationRequested.current = false;
    }
  }, [resolveLocation]);

  const setLocation = useCallback((latitude, longitude, name, newSource = 'search') => {
    const data = { latitude, longitude, name };
    if (!validCoordinates(data)) return;
    selectionVersion.current += 1;
    activeSource.current = newSource;
    setLocationState(data);
    setSource(newSource);
    writeStored(sessionStorage, SESSION_KEY, newSource === 'search' ? { data, source: newSource } : null);
    if (newSource === 'search' && name) {
      setRecentLocations(previous => {
        const updated = [data, ...previous.filter(item => item.latitude !== latitude || item.longitude !== longitude)]
          .slice(0, MAX_RECENT_LOCATIONS);
        writeStored(localStorage, RECENT_KEY, updated);
        return updated;
      });
    }
  }, []);

  const clearLocation = useCallback(() => {
    selectionVersion.current += 1;
    activeSource.current = null;
    writeStored(sessionStorage, SESSION_KEY, null);
    return resolveLocation(permissionStatus.current?.state === 'granted');
  }, [resolveLocation]);

  useEffect(() => {
    let cancelled = false;
    let status;
    const handlePermissionChange = () => {
      if (cancelled) return;
      setPermissionState(status.state);
      // Granting the pending prompt must not supersede that same request.
      if (!currentLocationRequested.current) resolveLocation(status.state === 'granted', true);
    };
    const initialize = async () => {
      const stored = readStored(sessionStorage, SESSION_KEY);
      if (stored?.source === 'search' && validCoordinates(stored.data)) {
        setLocationState(stored.data);
        setSource('search');
        activeSource.current = 'search';
      } else {
        writeStored(sessionStorage, SESSION_KEY, null);
      }
      // Retire the cache that could contain the old fabricated San Francisco value.
      writeStored(sessionStorage, 'starview_ip_location', null);
      if (navigator.permissions) {
        try {
          status = await navigator.permissions.query({ name: 'geolocation' });
          if (cancelled) return;
          permissionStatus.current = status;
          setPermissionState(status.state);
          status.addEventListener('change', handlePermissionChange);
        } catch { /* Permission API is not supported in every browser. */ }
      }
      if (!cancelled) await resolveLocation(status?.state === 'granted', true);
    };
    initialize();
    return () => {
      cancelled = true;
      detectionVersion.current += 1;
      status?.removeEventListener('change', handlePermissionChange);
    };
  }, [resolveLocation]);

  const value = useMemo(() => ({
    location, actualLocation, source, isLoading, permissionState, recentLocations,
    setLocation, requestCurrentLocation, clearLocation,
  }), [location, actualLocation, source, isLoading, permissionState, recentLocations,
    setLocation, requestCurrentLocation, clearLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * useLocation - Hook to access location state
 *
 * Must be used within a LocationProvider.
 */
export function useLocation() {
  const context = useContext(LocationContext);

  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }

  return context;
}

export default LocationContext;
