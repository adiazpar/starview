/**
 * useUserLocation Hook
 *
 * Gets the user's location with a fallback chain:
 * 1. Browser Geolocation API (requires explicit permission)
 * 2. User's profile location (if authenticated and set in profile)
 * 3. null (no location - distance features hidden, map defaults to day mode)
 *
 * Caches browser geolocation in localStorage to avoid repeated prompts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const CACHE_KEY = 'starview_user_location';
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes - short cache for responsive location updates

/**
 * Get user's location with fallback chain
 * @returns {Object} { location, isLoading, error, source, refresh }
 */
export function useUserLocation() {
  const [location, setLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null); // 'browser' | 'profile' | null
  const [permissionState, setPermissionState] = useState(null); // 'granted' | 'denied' | 'prompt' | null
  const { user, loading: authLoading } = useAuth();

  const cacheLocation = useCallback((coords) => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ coords, timestamp: Date.now() })
    );
    setLocation(coords);
    setSource('browser');
  }, []);

  // Check for profile location as fallback
  const checkProfileLocation = useCallback(() => {
    if (user?.location_latitude && user?.location_longitude) {
      setLocation({
        latitude: user.location_latitude,
        longitude: user.location_longitude,
      });
      setSource('profile');
      return true;
    }
    return false;
  }, [user]);

  const requestBrowserLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      return false;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000, // 1 minute - get relatively fresh position from browser
        });
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      cacheLocation(coords);
      return true;
    } catch (geoError) {
      // User denied permission or geolocation failed - clear cache
      // This ensures we don't use stale location when permission is revoked
      localStorage.removeItem(CACHE_KEY);
      setError(geoError.message);
      return false;
    }
  }, [cacheLocation]);

  // Main location resolution effect
  useEffect(() => {
    // Wait for auth to finish loading before checking profile fallback
    if (authLoading) return;

    let permissionStatus = null;
    let isSubscribed = true;

    // Handler for permission changes (user grants/revokes geolocation)
    // This allows the app to react automatically without page refresh
    const handlePermissionChange = async () => {
      if (!isSubscribed) return;

      setPermissionState(permissionStatus?.state || null);

      if (permissionStatus?.state === 'granted') {
        // User just granted permission - fetch their location
        const gotLocation = await requestBrowserLocation();
        if (!gotLocation && isSubscribed) {
          checkProfileLocation();
        }
      } else if (permissionStatus?.state === 'denied') {
        // User revoked permission - clear cached location and fall back
        localStorage.removeItem(CACHE_KEY);
        if (isSubscribed) {
          setLocation(null);
          setSource(null);
          checkProfileLocation();
        }
      }
    };

    const resolveLocation = async () => {
      setIsLoading(true);

      // Check geolocation permission state
      let permissionGranted = false;
      if (navigator.permissions) {
        try {
          permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
          setPermissionState(permissionStatus.state);
          permissionGranted = permissionStatus.state === 'granted';

          // Clear cache if permission denied or prompt (user hasn't granted)
          if (permissionStatus.state !== 'granted') {
            localStorage.removeItem(CACHE_KEY);
          }
          // Listen for permission changes
          permissionStatus.addEventListener('change', handlePermissionChange);
        } catch {
          // Permissions API not supported for geolocation in some browsers
        }
      }

      // Only use localStorage cache if geolocation permission is granted
      // This prevents stale cached locations from overriding profile location
      if (permissionGranted) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { coords, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
              setLocation(coords);
              setSource('browser');
              setIsLoading(false);
              return;
            }
          } catch {
            localStorage.removeItem(CACHE_KEY);
          }
        }

        // Try browser geolocation
        const gotBrowserLocation = await requestBrowserLocation();
        if (gotBrowserLocation) {
          setIsLoading(false);
          return;
        }
      }

      // Fallback to profile location (used when geolocation not granted)
      checkProfileLocation();
      setIsLoading(false);
    };

    resolveLocation();

    return () => {
      isSubscribed = false;
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handlePermissionChange);
      }
    };
  }, [authLoading, requestBrowserLocation, checkProfileLocation]);

  // Refresh function - tries browser first, then profile
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const gotBrowserLocation = await requestBrowserLocation();
    if (!gotBrowserLocation) {
      checkProfileLocation();
    }

    setIsLoading(false);
  }, [requestBrowserLocation, checkProfileLocation]);

  return {
    location,
    isLoading,
    error,
    source, // 'browser' | 'profile' | null - indicates where location came from
    permissionState, // 'granted' | 'denied' | 'prompt' | null
    refresh,
  };
}

export default useUserLocation;
