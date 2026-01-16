/**
 * Bortle Scale API Service
 *
 * Fetches light pollution data (Bortle class) for a location.
 * The Bortle scale ranges from 1 (excellent dark sky) to 9 (inner city).
 */

import api from './api';

const bortleApi = {
  /**
   * Get Bortle class for a location
   * @param {Object} params - Query parameters
   * @param {number} params.lat - Latitude
   * @param {number} params.lng - Longitude
   * @returns {Promise<{bortle: number, sqm: number, description: string, quality: string, location: Object}>}
   */
  getBortle: async ({ lat, lng }) => {
    const response = await api.get('/bortle/', { params: { lat, lng } });
    return response.data;
  },
};

export default bortleApi;
