/**
 * LocationContext
 *
 * Unified location management for the entire Starview app.
 * Location is ephemeral (session-based) enabling a "check conditions anywhere" experience.
 * Used by sky pages (Tonight, Weather, Bortle) AND Explore page for consistent location context.
 *
 * Resolution order:
 * 1. sessionStorage (existing active location)
 * 2. Browser geolocation (if permission granted)
 * 3. IP geolocation (/api/geolocate/)
 *
 * Two location states:
 * - location: Current active location (changes with search)
 * - actualLocation: User's real location (stable, from IP/browser only)
 *
 * Usage:
 *   const { location, actualLocation, source, isLoading, permissionState, setLocation, requestCurrentLocation, clearLocation } = useLocation();
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';

const LocationContext = createContext(null);

// Storage keys
const SESSION_KEY = 'starview_active_location';
const RECENT_KEY = 'starview_recent_locations';
const IP_CACHE_KEY = 'starview_ip_location'; // Unified cache for entire app
const IP_CACHE_DURATION = 1000 * 60 * 60; // 1 hour
const MAX_RECENT_LOCATIONS = 5;

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(null);
  const [actualLocation, setActualLocation] = useState(null); // Stable user location (IP/browser), doesn't change on search
  const [source, setSource] = useState(null); // 'browser' | 'ip' | 'search'
  const [isLoading, setIsLoading] = useState(true);
  const [permissionState, setPermissionState] = useState(null); // 'granted' | 'denied' | 'prompt' | null
  const [recentLocations, setRecentLocations] = useState([]);
  const hasInitialized = useRef(false);
  const permissionStatusRef = useRef(null);

  // Load recent locations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        setRecentLocations(JSON.parse(stored));
      }
    } catch {
      localStorage.removeItem(RECENT_KEY);
    }
  }, []);

  // Save recent locations to localStorage when they change
  const saveRecentLocation = useCallback((loc) => {
    if (!loc?.name) return;

    setRecentLocations((prev) => {
      // Remove duplicate if exists
      const filtered = prev.filter(
        (r) => r.latitude !== loc.latitude || r.longitude !== loc.longitude
      );
      // Add to front, limit to MAX_RECENT_LOCATIONS
      const updated = [
        { latitude: loc.latitude, longitude: loc.longitude, name: loc.name },
        ...filtered,
      ].slice(0, MAX_RECENT_LOCATIONS);

      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Fetch IP-based location as fallback
  const fetchIPLocation = useCallback(async (skipActualUpdate = false) => {
    // Check localStorage cache first
    const cached = localStorage.getItem(IP_CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < IP_CACHE_DURATION) {
          setLocationState(data);
          setSource('ip');
          // Set actualLocation if not already set and not skipped
          if (!skipActualUpdate) {
            setActualLocation((prev) => prev || data);
          }
          return true;
        }
      } catch {
        localStorage.removeItem(IP_CACHE_KEY);
      }
    }

    try {
      const response = await api.get('/geolocate/');
      if (response.data.latitude && response.data.longitude) {
        const data = {
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          name: response.data.city
            ? `${response.data.city}, ${response.data.region}`
            : 'Your location',
        };
        // Cache IP location locally
        localStorage.setItem(
          IP_CACHE_KEY,
          JSON.stringify({ data, timestamp: Date.now() })
        );
        setLocationState(data);
        setSource('ip');
        // Set actualLocation if not already set and not skipped
        if (!skipActualUpdate) {
          setActualLocation((prev) => prev || data);
        }
        return true;
      }
    } catch {
      // IP geolocation failed
    }
    return false;
  }, []);

  // Request browser geolocation
  const requestBrowserLocation = useCallback(async (updateActualLocation = false) => {
    if (!navigator.geolocation) {
      return false;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const data = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        name: 'Current location',
      };

      setLocationState(data);
      setSource('browser');

      // Save to session
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, source: 'browser' }));

      // Update actualLocation if requested (during initialization)
      if (updateActualLocation) {
        setActualLocation((prev) => prev || data);
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  // Public method to request current location (for "Use my location" buttons)
  const requestCurrentLocation = useCallback(async () => {
    setIsLoading(true);
    const success = await requestBrowserLocation();
    if (!success) {
      // Fall back to IP if browser fails
      await fetchIPLocation();
    }
    setIsLoading(false);
    return success;
  }, [requestBrowserLocation, fetchIPLocation]);

  // Set location (for search results, "Check Conditions Here", etc.)
  const setLocation = useCallback(
    (latitude, longitude, name, newSource = 'search') => {
      const data = { latitude, longitude, name };
      setLocationState(data);
      setSource(newSource);

      // Save to session
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, source: newSource }));

      // Add to recent locations for search-based locations
      if (newSource === 'search') {
        saveRecentLocation(data);
      }
    },
    [saveRecentLocation]
  );

  // Clear location (reset to IP fallback)
  const clearLocation = useCallback(async () => {
    sessionStorage.removeItem(SESSION_KEY);
    setLocationState(null);
    setSource(null);
    setIsLoading(true);
    // Skip actualLocation update - it should remain stable
    await fetchIPLocation(true);
    setIsLoading(false);
  }, [fetchIPLocation]);

  // Initialize location on mount and monitor permission changes
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const handlePermissionChange = () => {
      const state = permissionStatusRef.current?.state;
      setPermissionState(state || null);

      // If permission just granted, try to get browser location
      if (state === 'granted') {
        requestBrowserLocation();
      }
    };

    const initialize = async () => {
      setIsLoading(true);

      // 1. Check sessionStorage first
      let hasStoredLocation = false;
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          const { data, source: storedSource } = JSON.parse(stored);
          if (data?.latitude && data?.longitude) {
            setLocationState(data);
            setSource(storedSource);
            // For browser/ip sources, use as actualLocation too
            if (storedSource === 'browser' || storedSource === 'ip') {
              setActualLocation(data);
            }
            setIsLoading(false);
            hasStoredLocation = true;
            // Continue to check permission state even if we have a stored location
          }
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }

      // 2. Check browser geolocation permission and set up monitoring
      let permissionGranted = false;
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          permissionStatusRef.current = status;
          permissionGranted = status.state === 'granted';
          setPermissionState(status.state);

          // Listen for permission changes
          status.addEventListener('change', handlePermissionChange);
        } catch {
          // Permissions API not supported
        }
      }

      // If stored location is from search, still get actualLocation from IP/browser
      if (hasStoredLocation) {
        // For search-based stored locations, get actual user location in background
        const storedData = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
        if (storedData.source === 'search') {
          // Get actualLocation from IP (don't update main location)
          const cachedIP = localStorage.getItem(IP_CACHE_KEY);
          if (cachedIP) {
            try {
              const { data, timestamp } = JSON.parse(cachedIP);
              if (Date.now() - timestamp < IP_CACHE_DURATION) {
                setActualLocation(data);
              }
            } catch {
              // Ignore cache errors
            }
          }
        }
        return;
      }

      // 3. If permission granted, try browser geolocation
      if (permissionGranted) {
        const gotBrowser = await requestBrowserLocation(true); // updateActualLocation=true
        if (gotBrowser) {
          setIsLoading(false);
          return;
        }
      }

      // 4. Fall back to IP geolocation (will also set actualLocation)
      await fetchIPLocation();
      setIsLoading(false);
    };

    initialize();

    // Cleanup permission listener on unmount
    return () => {
      if (permissionStatusRef.current) {
        permissionStatusRef.current.removeEventListener('change', handlePermissionChange);
      }
    };
  }, [requestBrowserLocation, fetchIPLocation]);

  // Memoize context value to prevent unnecessary re-renders in consumers
  const value = useMemo(() => ({
    location,
    actualLocation, // Stable user location (IP/browser), doesn't change on search
    source,
    isLoading,
    permissionState,
    recentLocations,
    setLocation,
    requestCurrentLocation,
    clearLocation,
  }), [location, actualLocation, source, isLoading, permissionState, recentLocations, setLocation, requestCurrentLocation, clearLocation]);

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
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
