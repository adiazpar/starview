/**
 * Stats API Service
 *
 * Fetches platform-wide statistics from the backend.
 */

import api from './api';

const statsApi = {
  /**
   * Get platform statistics (locations, reviews, stargazers counts)
   * @returns {Promise<{locations: {count, formatted}, reviews: {count, formatted}, stargazers: {count, formatted}}>}
   */
  getPlatformStats: async () => {
    const response = await api.get('/stats/');
    return response.data;
  },
};

export default statsApi;
