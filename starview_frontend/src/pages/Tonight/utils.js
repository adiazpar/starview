/**
 * Tonight Page Utilities
 * Filter hourly weather data to nighttime hours for stargazing timeline.
 */

/**
 * Filter hourly data to nighttime hours (6PM-6AM)
 * @param {Array} hourly - Array of hourly weather data
 * @returns {Array} Filtered nighttime hours
 */
export function getNighttimeHours(hourly) {
  if (!hourly?.length) return [];

  const now = new Date();
  const tonight6pm = new Date(now);
  tonight6pm.setHours(18, 0, 0, 0);

  // If before 6pm, use today's 6pm; otherwise check if we're in early morning
  if (now.getHours() >= 6 && now.getHours() < 18) {
    // Daytime - tonight starts today at 6pm
  } else if (now.getHours() < 6) {
    // Early morning - we're in "tonight" that started yesterday
    tonight6pm.setDate(tonight6pm.getDate() - 1);
  }

  const tomorrow6am = new Date(tonight6pm);
  tomorrow6am.setDate(tomorrow6am.getDate() + 1);
  tomorrow6am.setHours(6, 0, 0, 0);

  return hourly.filter((h) => {
    const hourTime = new Date(h.time);
    return hourTime >= tonight6pm && hourTime < tomorrow6am;
  });
}

/**
 * Calculate average cloud cover for nighttime hours
 * @param {Array} nighttimeHours - Filtered nighttime hours
 * @returns {number|null} Average cloud cover percentage
 */
export function getNighttimeAverage(nighttimeHours) {
  if (!nighttimeHours?.length) return null;
  const sum = nighttimeHours.reduce((acc, h) => acc + (h.cloud_cover ?? 0), 0);
  return Math.round(sum / nighttimeHours.length);
}

/**
 * Calculate all weather averages for nighttime hours
 * @param {Array} nighttimeHours - Filtered nighttime hours
 * @returns {Object} Averages for cloud cover, humidity, wind, and temperature
 */
export function getNighttimeWeatherAverages(nighttimeHours) {
  if (!nighttimeHours?.length) {
    return {
      cloudCover: null,
      humidity: null,
      windSpeed: null,
      temperature: null,
    };
  }

  // Helper to calculate average of valid values
  const calcAverage = (key) => {
    const validValues = nighttimeHours
      .map((h) => h[key])
      .filter((v) => v !== null && v !== undefined);
    if (!validValues.length) return null;
    return Math.round(validValues.reduce((sum, v) => sum + v, 0) / validValues.length);
  };

  return {
    cloudCover: calcAverage('cloud_cover'),
    humidity: calcAverage('humidity'),
    windSpeed: calcAverage('wind_speed'),
    temperature: calcAverage('temperature'),
  };
}

/**
 * Cloud layer labels with altitude information
 */
export const CLOUD_LAYER_LABELS = {
  high: { name: 'High', altitude: '> 6km' },
  mid: { name: 'Mid', altitude: '2-6km' },
  low: { name: 'Low', altitude: '< 2km' },
};

/**
 * Get stargazing insight message based on cloud layer composition
 * @param {number|null} low - Low cloud cover percentage (0-100)
 * @param {number|null} mid - Mid cloud cover percentage (0-100)
 * @param {number|null} high - High cloud cover percentage (0-100)
 * @returns {{ message: string, quality: 'good'|'fair'|'poor' }|null}
 */
export function getCloudLayerInsight(low, mid, high) {
  // Return null if all values are missing
  if (low == null && mid == null && high == null) return null;

  // Use 0 for null values in calculations
  const l = low ?? 0;
  const m = mid ?? 0;
  const h = high ?? 0;
  const total = l + m + h;

  // Clear skies - all layers under 20%
  if (l < 20 && m < 20 && h < 20) {
    return { message: 'Clear skies — excellent conditions', quality: 'good' };
  }

  // Heavy cloud cover - any layer > 50% or total > 120%
  if (l > 50 || m > 50 || h > 50 || total > 120) {
    return { message: 'Heavy cloud cover — very limited viewing', quality: 'poor' };
  }

  // Low clouds dominating
  if (l > 40 && l > m && l > h) {
    return { message: 'Low clouds dominating — poor visibility expected', quality: 'poor' };
  }

  // High clouds only (others minimal)
  if (h > 30 && l < 20 && m < 20) {
    return { message: 'High clouds only — bright stars may be visible', quality: 'fair' };
  }

  // Mid-level clouds dominating
  if (m > 40 && m > l && m > h) {
    return { message: 'Mid-level clouds — some clear breaks possible', quality: 'fair' };
  }

  // Partly cloudy - total under 80%
  if (total < 80) {
    return { message: 'Partly cloudy — best for bright objects', quality: 'fair' };
  }

  // Default mixed conditions
  return { message: 'Mixed cloud layers — variable conditions', quality: 'fair' };
}
