/**
 * Moon Phases API Service
 *
 * Fetches moon phase data for stargazing planning.
 */

import api from './api';

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
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

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
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const params = { start_date: startOfMonth, end_date: endOfMonth };
    if (lat !== undefined && lng !== undefined) {
      params.lat = lat;
      params.lng = lng;
    }

    return moonApi.getPhases(params);
  },
};

export default moonApi;
