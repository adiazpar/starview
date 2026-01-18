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
