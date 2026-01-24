/**
 * Directions API Service
 *
 * Fetches driving directions via the backend proxy endpoint.
 * The backend keeps the OpenRouteService API key server-side for security.
 */

import api from './api';

/**
 * Get driving directions between two points.
 *
 * @param {Object} from - Starting coordinates { latitude, longitude }
 * @param {Object} to - Destination coordinates { latitude, longitude }
 * @returns {Promise<Object>} - GeoJSON response with route geometry and summary
 */
export async function getDirections(from, to) {
  const response = await api.get('/directions/', {
    params: {
      origin: `${from.latitude},${from.longitude}`,
      destination: `${to.latitude},${to.longitude}`,
    },
  });
  return response.data;
}
