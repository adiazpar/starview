/**
 * Geographic utility functions for distance and location calculations.
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Format distance for display
 * @param {number} km - Distance in kilometers
 * @returns {string} Formatted distance string
 */
export function formatDistance(km) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  } else if (km < 10) {
    return `${km.toFixed(1)} km`;
  } else if (km < 1000) {
    return `${Math.round(km)} km`;
  } else {
    return `${(km / 1000).toFixed(1)}k km`;
  }
}

/**
 * Format elevation for display
 * @param {number} meters - Elevation in meters
 * @returns {string} Formatted elevation string
 */
export function formatElevation(meters) {
  if (meters < 0) {
    return `${Math.round(meters)} m`; // Below sea level (e.g., Death Valley)
  }
  // Use locale formatting for thousands separator
  return `${Math.round(meters).toLocaleString()} m`;
}
