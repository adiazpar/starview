/**
 * Moon Phases API Service
 *
 * Fetches moon phase data for stargazing planning.
 */

import api from './api';

/**
 * Format a Date object as YYYY-MM-DD in local timezone
 * IMPORTANT: Do not use toISOString() as it returns UTC date,
 * which can be the wrong day when it's evening in western timezones.
 */
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const moonApi = {
  /**
   * Get moon phases for a date range
   * @param {Object} params - Query parameters
   * @param {string} params.start_date - Start date (YYYY-MM-DD)
   * @param {string} params.end_date - End date (YYYY-MM-DD)
   * @param {number} params.lat - Optional latitude for moonrise/moonset
   * @param {number} params.lng - Optional longitude for moonrise/moonset
   * @param {boolean} params.key_dates_only - Return only key phase dates
   * @returns {Promise<{phases: Array, key_dates: Object, location?: Object}>}
   */
  getPhases: async (params = {}) => {
    const response = await api.get('/moon-phases/', { params });
    return response.data;
  },

  /**
   * Get phases for the current week
   * @param {number} lat - Optional latitude
   * @param {number} lng - Optional longitude
   * @returns {Promise}
   */
  getCurrentWeek: async (lat, lng) => {
    const today = formatLocalDate(new Date());
    const nextWeek = formatLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const params = { start_date: today, end_date: nextWeek };
    if (lat !== undefined && lng !== undefined) {
      params.lat = lat;
      params.lng = lng;
    }

    return moonApi.getPhases(params);
  },

  /**
   * Get phases for the current month
   * @param {number} lat - Optional latitude
   * @param {number} lng - Optional longitude
   * @returns {Promise}
   */
  getCurrentMonth: async (lat, lng) => {
    const today = new Date();
    const startOfMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const endOfMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const params = { start_date: startOfMonth, end_date: endOfMonth };
    if (lat !== undefined && lng !== undefined) {
      params.lat = lat;
      params.lng = lng;
    }

    return moonApi.getPhases(params);
  },
};

export default moonApi;
