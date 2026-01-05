/**
 * Navigation Utilities
 *
 * Helper functions for GPS navigation feature:
 * - Duration formatting
 * - Deep link URL generation for navigation apps
 * - Address geocoding via Mapbox
 *
 * NOTE: For distance formatting with unit preference support,
 * use the useUnits hook or utils/units.js instead.
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Format duration in seconds to human-readable string.
 * For trips 4+ hours, shows only hours (rounded) for cleaner display.
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration (e.g., "12 min", "1 hr 23 min", or "19 hr")
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0 min';

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // For long trips (4+ hours), just show rounded hours
  if (hours >= 4) {
    const roundedHours = Math.round(seconds / 3600);
    return `${roundedHours} hr`;
  }

  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours} hr`;
  } else {
    return `${hours} hr ${minutes} min`;
  }
}

/**
 * Detect user's platform for navigation app selection.
 * @returns {'ios' | 'android' | 'desktop'}
 */
export function detectPlatform() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;

  // iOS detection
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return 'ios';
  }

  // Android detection
  if (/android/i.test(ua)) {
    return 'android';
  }

  return 'desktop';
}

/**
 * Generate deep link URLs for navigation apps.
 * All URLs are configured to auto-start turn-by-turn navigation.
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @returns {object} - URLs for each navigation app
 */
export function getNavigationUrls(lat, lng) {
  return {
    // dir_action=navigate auto-starts turn-by-turn navigation
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`,
    // dirflg=d means driving directions
    apple: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    // navigate=yes auto-starts navigation in Waze
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/**
 * Get the platform-appropriate navigation URL.
 * - iOS: Opens Apple Maps (native experience)
 * - Android: Opens Google Maps (Android auto-handles the intent)
 * - Desktop: Opens Google Maps web
 *
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @returns {string} - URL to open for navigation
 */
export function getPlatformNavigationUrl(lat, lng) {
  const platform = detectPlatform();
  const urls = getNavigationUrls(lat, lng);

  switch (platform) {
    case 'ios':
      return urls.apple;
    case 'android':
      return urls.google;
    default:
      return urls.google;
  }
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
