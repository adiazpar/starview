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

// Inverse conversion: miles to km
const MI_TO_KM = 1.60934;

// Speed conversion
const KMH_TO_MPH = 0.621371;

/**
 * Format radius filter option for display.
 * Internal storage is miles, but display adapts to user preference.
 *
 * @param {number} miles - Radius in miles (internal standard for filters)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted radius string (e.g., "50 mi" or "80 km")
 */
export function formatRadius(miles, units = 'metric') {
  if (miles == null || isNaN(miles)) return '--';

  if (units === 'metric') {
    const km = Math.round(miles * MI_TO_KM);
    return `${km} km`;
  }

  return `${miles} mi`;
}

/**
 * Format wind speed for display based on unit preference.
 *
 * @param {number} kmh - Wind speed in km/h (internal standard)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted speed string (e.g., "10 km/h" or "6 mph")
 */
export function formatWindSpeed(kmh, units = 'metric') {
  if (kmh == null || isNaN(kmh)) return '--';

  if (units === 'imperial') {
    const mph = Math.round(kmh * KMH_TO_MPH);
    return `${mph} mph`;
  }

  return `${Math.round(kmh)} km/h`;
}

/**
 * Format visibility for display based on unit preference.
 *
 * @param {number} km - Visibility in kilometers (internal standard)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted visibility string (e.g., "10 km" or "6 mi")
 */
export function formatVisibility(km, units = 'metric') {
  if (km == null || isNaN(km)) return '--';

  if (units === 'imperial') {
    const miles = km * KM_TO_MI;
    if (miles >= 10) {
      return `${Math.round(miles)} mi`;
    }
    return `${miles.toFixed(1)} mi`;
  }

  if (km >= 10) {
    return `${Math.round(km)} km`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Get wind speed unit label based on preference.
 *
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Unit label (e.g., "km/h" or "mph")
 */
export function getWindSpeedUnit(units = 'metric') {
  return units === 'imperial' ? 'mph' : 'km/h';
}

/**
 * Format temperature for display based on unit preference.
 *
 * @param {number} celsius - Temperature in Celsius (internal standard)
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted temperature string (e.g., "20°C" or "68°F")
 */
export function formatTemperature(celsius, units = 'metric') {
  if (celsius == null || isNaN(celsius)) return '--';

  if (units === 'imperial') {
    const fahrenheit = Math.round((celsius * 9/5) + 32);
    return `${fahrenheit}°F`;
  }

  return `${Math.round(celsius)}°C`;
}
