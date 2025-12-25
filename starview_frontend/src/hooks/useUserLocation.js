/**
 * useUserLocation Hook
 *
 * Gets the user's current location using multiple strategies:
 * 1. Browser Geolocation API (most accurate, requires permission)
 * 2. IP-based geolocation fallback (city-level accuracy, no permission needed)
 *
 * Caches the location in localStorage to avoid repeated requests.
 */

import { useState, useEffect } from 'react';

const CACHE_KEY = 'starview_user_location';
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

/**
 * Get location from IP address (fallback)
 * Uses ipapi.co - free HTTPS, 1000 requests/day, no API key required
 */
async function getLocationFromIP() {
  const response = await fetch('https://ipapi.co/json/');
  const data = await response.json();

  if (data.latitude && data.longitude) {
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      source: 'ip',
    };
  }
  throw new Error('IP geolocation failed');
}

/**
 * Get user's current geolocation
 * @returns {Object} { location, isLoading, error, source, refresh }
 */
export function useUserLocation() {
  const [location, setLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null); // 'browser' or 'ip'

  // Try to get cached location first
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { coords, timestamp, source: cachedSource } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          setLocation(coords);
          setSource(cachedSource || 'browser');
          setIsLoading(false);
          return;
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    // Request fresh location
    requestLocation();
  }, []);

  const cacheLocation = (coords, locationSource) => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ coords, source: locationSource, timestamp: Date.now() })
    );
    setLocation(coords);
    setSource(locationSource);
  };

  const requestLocation = async () => {
    setIsLoading(true);
    setError(null);

    // Try browser geolocation first
    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 5000, // Shorter timeout, fall back faster
            maximumAge: CACHE_DURATION,
          });
        });

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        cacheLocation(coords, 'browser');
        setIsLoading(false);
        return;
      } catch (geoError) {
        // Browser geolocation failed, try IP fallback
        console.log('Browser geolocation unavailable, trying IP fallback');
      }
    }

    // Fallback to IP geolocation
    try {
      const coords = await getLocationFromIP();
      cacheLocation(coords, 'ip');
      setIsLoading(false);
    } catch (ipError) {
      setError('Could not determine location');
      setIsLoading(false);
    }
  };

  return {
    location,
    isLoading,
    error,
    source, // 'browser' or 'ip' - useful for showing accuracy indicator
    refresh: requestLocation,
  };
}

export default useUserLocation;
