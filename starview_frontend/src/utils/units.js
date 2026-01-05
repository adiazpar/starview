/**
 * Unified Unit Formatting Utilities
 *
 * Provides consistent distance, elevation, and area formatting
 * based on user's unit preference (metric or imperial).
 */

// Conversion constants
const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;
const KM2_TO_MI2 = 0.386102;

/**
 * Format distance for display based on unit preference.
 * Automatically chooses appropriate sub-units (m/km or ft/mi).
 *
 * @param {number} km - Distance in kilometers (internal standard)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted distance string
 */
export function formatDistance(km, units = 'metric') {
  if (km == null || isNaN(km)) return '--';

  if (units === 'imperial') {
    const miles = km * KM_TO_MI;
    if (miles < 0.1) {
      const feet = Math.round(km * 1000 * M_TO_FT);
      return `${feet.toLocaleString()} ft`;
    } else if (miles < 10) {
      return `${miles.toFixed(1)} mi`;
    } else if (miles < 1000) {
      return `${Math.round(miles).toLocaleString()} mi`;
    } else {
      return `${(miles / 1000).toFixed(1)}k mi`;
    }
  }

  // Metric (default)
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  } else if (km < 10) {
    return `${km.toFixed(1)} km`;
  } else if (km < 1000) {
    return `${Math.round(km).toLocaleString()} km`;
  } else {
    return `${(km / 1000).toFixed(1)}k km`;
  }
}

/**
 * Format elevation for display based on unit preference.
 *
 * @param {number} meters - Elevation in meters (internal standard)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted elevation string
 */
export function formatElevation(meters, units = 'metric') {
  if (meters == null || isNaN(meters)) return '--';

  if (units === 'imperial') {
    const feet = Math.round(meters * M_TO_FT);
    return `${feet.toLocaleString()} ft`;
  }

  // Metric (default)
  return `${Math.round(meters).toLocaleString()} m`;
}

/**
 * Format area for display based on unit preference.
 * Used for protected areas overlay.
 *
 * @param {number} km2 - Area in square kilometers
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted area string
 */
export function formatArea(km2, units = 'metric') {
  if (km2 == null || isNaN(km2)) return '--';

  if (units === 'imperial') {
    const mi2 = km2 * KM2_TO_MI2;
    if (mi2 >= 1000) {
      return `${(mi2 / 1000).toFixed(1)}k mi²`;
    }
    return `${Math.round(mi2).toLocaleString()} mi²`;
  }

  // Metric (default)
  if (km2 >= 1000) {
    return `${(km2 / 1000).toFixed(1)}k km²`;
  }
  return `${Math.round(km2).toLocaleString()} km²`;
}

/**
 * Format route distance from navigation APIs.
 * Navigation APIs return meters, so this handles the conversion.
 *
 * @param {number} meters - Distance in meters from routing API
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted distance string
 */
export function formatRouteDistance(meters, units = 'metric') {
  if (meters == null || isNaN(meters)) return '--';

  // Convert meters to km, then use formatDistance
  const km = meters / 1000;
  return formatDistance(km, units);
}
