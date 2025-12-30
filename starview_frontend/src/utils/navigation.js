/**
 * Navigation Utilities
 *
 * Helper functions for GPS navigation feature:
 * - Duration/distance formatting
 * - Deep link URL generation for navigation apps
 * - Address geocoding via Mapbox
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Format duration in seconds to human-readable string.
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration (e.g., "12 min" or "1 hr 23 min")
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0 min';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours} hr`;
  } else {
    return `${hours} hr ${minutes} min`;
  }
}

/**
 * Format distance in meters to human-readable string.
 * Uses miles for US users.
 * @param {number} meters - Distance in meters
 * @returns {string} - Formatted distance (e.g., "3.2 mi")
 */
export function formatDistance(meters) {
  if (!meters || meters < 0) return '0 mi';

  const miles = meters / 1609.344;

  if (miles < 0.1) {
    // Show in feet for very short distances
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  } else if (miles < 10) {
    return `${miles.toFixed(1)} mi`;
  } else {
    return `${Math.round(miles)} mi`;
  }
}

/**
 * Generate deep link URLs for navigation apps.
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
 * Get list of available navigation apps with metadata.
 * @returns {Array} - Array of app objects with id, name, and icon
 */
export function getAvailableNavigationApps() {
  return [
    { id: 'google', name: 'Google Maps', icon: 'fa-brands fa-google' },
    { id: 'apple', name: 'Apple Maps', icon: 'fa-brands fa-apple' },
    { id: 'waze', name: 'Waze', icon: 'fa-solid fa-location-dot' },
  ];
}

/**
 * Geocode an address string to coordinates using Mapbox Geocoding API.
 * @param {string} address - Address string to geocode
 * @returns {Promise<{latitude: number, longitude: number}>} - Coordinates
 * @throws {Error} - If address cannot be geocoded
 */
export async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error('Please enter an address');
  }

  if (!MAPBOX_TOKEN) {
    throw new Error('Geocoding service unavailable');
  }

  const encodedAddress = encodeURIComponent(address.trim());
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?` +
    `access_token=${MAPBOX_TOKEN}&types=address,place,poi&limit=1`
  );

  if (!response.ok) {
    throw new Error('Unable to find address');
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('Address not found');
  }

  const [longitude, latitude] = data.features[0].center;

  return { latitude, longitude };
}
