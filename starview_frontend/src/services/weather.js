/**
 * Weather API Service
 *
 * Fetches weather data for stargazing planning.
 * Supports current forecasts and historical averages for future planning.
 * Cloud cover is the primary metric for stargazing conditions.
 */

import api from './api';

/**
 * Format a Date object as YYYY-MM-DD in local timezone
 */
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const weatherApi = {
  /**
   * Get weather data for a location and date
   * @param {Object} params - Query parameters
   * @param {number} params.lat - Latitude
   * @param {number} params.lng - Longitude
   * @param {Date} params.date - Optional date (defaults to today)
   * @returns {Promise<{current: Object, daily: Array, location: Object}>}
   *
   * The API automatically selects data source based on date:
   * - Today to +16 days: Real forecast
   * - Past dates: Historical archive
   * - +17 days and beyond: 5-year historical average
   */
  getForecast: async ({ lat, lng, date }) => {
    const params = { lat, lng };

    if (date) {
      const dateStr = formatLocalDate(date);
      params.start_date = dateStr;
      params.end_date = dateStr;
    }

    const response = await api.get('/weather/', { params });
    return response.data;
  },
};

export default weatherApi;
