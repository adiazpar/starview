/**
 * Navigation utility functions for GPS directions and deep linking
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted string like "12 min" or "1 hr 23 min"
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return hours === 1 ? '1 hr' : `${hours} hrs`;
  }

  return `${hours} hr ${minutes} min`;
}

/**
 * Format distance in meters to human-readable string (miles)
 * @param {number} meters - Distance in meters
 * @returns {string} - Formatted string like "3.2 mi"
 */
export function formatDistance(meters) {
  if (!meters || meters < 0) return '';

  const miles = meters / 1609.344;

  if (miles < 0.1) {
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }

  if (miles < 10) {
    return `${miles.toFixed(1)} mi`;
  }

  return `${Math.round(miles)} mi`;
}

/**
 * Generate navigation app deep link URLs
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @returns {object} - URLs for each navigation app
 */
export function getNavigationUrls(lat, lng) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    apple: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/**
 * Geocode an address to coordinates using Mapbox Geocoding API
 * @param {string} address - Address string to geocode
 * @returns {Promise<{latitude: number, longitude: number}>}
 * @throws {Error} if address not found or API error
 */
export async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error('Address is required');
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json`
  );
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('types', 'address,place,poi');
  url.searchParams.set('limit', '1');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to geocode address');
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('Address not found');
  }

  const [longitude, latitude] = data.features[0].center;
  return { latitude, longitude };
}

/**
 * Detect user's platform for showing relevant navigation apps
 * @returns {'ios' | 'macos' | 'android' | 'desktop'}
 */
export function getPlatform() {
  const ua = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0) return 'ios'; // iPad with desktop mode
  if (/Macintosh/.test(ua)) return 'macos';
  if (/Android/.test(ua)) return 'android';

  return 'desktop';
}

/**
 * Get available navigation apps for the current platform
 * @returns {Array<{id: string, name: string, icon: string}>}
 */
export function getAvailableNavigationApps() {
  const platform = getPlatform();

  const apps = [
    { id: 'google', name: 'Google Maps', icon: 'fa-brands fa-google' },
    { id: 'waze', name: 'Waze', icon: 'fa-solid fa-location-arrow' },
  ];

  // Apple Maps available on Apple platforms and desktop (opens in browser)
  if (platform === 'ios' || platform === 'macos' || platform === 'desktop') {
    apps.splice(1, 0, { id: 'apple', name: 'Apple Maps', icon: 'fa-solid fa-map' });
  }

  return apps;
}
