/**
 * Locations API Service
 *
 * All API calls related to stargazing locations.
 * Each function returns a Promise that resolves to the API response.
 */

import api from './api';

export const locationsApi = {
  /**
   * Get all locations (paginated)
   * @param {Object} params - Query parameters (page, search, etc.)
   * @returns {Promise} - { count, next, previous, results: [locations] }
   */
  getAll: (params = {}) => {
    return api.get('/locations/', { params });
  },

  /**
   * Get a single location by ID
   * @param {number} id - Location ID
   * @returns {Promise} - Location object with all details
   */
  getById: (id) => {
    return api.get(`/locations/${id}/`);
  },

  /**
   * Get map locations as GeoJSON FeatureCollection
   * @param {Object} params - Optional query parameters
   * @param {string} params.bbox - Bounding box as "west,south,east,north"
   * @returns {Promise} - GeoJSON FeatureCollection ready for Mapbox
   */
  getMapGeoJSON: (params = {}) => {
    return api.get('/locations/map_geojson/', { params });
  },

  /**
   * Create a new location
   * @param {Object} data - Location data (name, latitude, longitude, etc.)
   * @returns {Promise} - Created location object
   */
  create: (data) => {
    return api.post('/locations/', data);
  },

  /**
   * Update an existing location
   * @param {number} id - Location ID
   * @param {Object} data - Updated location data
   * @returns {Promise} - Updated location object
   */
  update: (id, data) => {
    return api.patch(`/locations/${id}/`, data);
  },

  /**
   * Delete a location
   * @param {number} id - Location ID
   * @returns {Promise}
   */
  delete: (id) => {
    return api.delete(`/locations/${id}/`);
  },

  /**
   * Get reviews for a specific location
   * @param {number} locationId - Location ID
   * @returns {Promise} - Array of reviews
   */
  getReviews: (locationId) => {
    return api.get(`/locations/${locationId}/reviews/`);
  },

  /**
   * Create a review for a location
   * @param {number} locationId - Location ID
   * @param {Object} data - Review data (rating, content, photos)
   * @returns {Promise} - Created review object
   */
  createReview: (locationId, data) => {
    return api.post(`/locations/${locationId}/reviews/`, data);
  },

  /**
   * Vote on a review (upvote toggle)
   * @param {number} locationId - Location ID
   * @param {number} reviewId - Review ID
   * @returns {Promise} - { detail, upvotes, downvotes, vote_count, user_vote }
   */
  voteOnReview: (locationId, reviewId) => {
    return api.post(`/locations/${locationId}/reviews/${reviewId}/vote/`, {
      vote_type: 'up',
    });
  },

  /**
   * Mark a location as visited (check-in)
   * @param {number} locationId - Location ID
   * @returns {Promise} - { detail: string, total_visits: number, newly_earned_badges: Array }
   */
  markVisited: (locationId) => {
    return api.post(`/locations/${locationId}/mark-visited/`);
  },

  /**
   * Unmark a location as visited (remove check-in)
   * @param {number} locationId - Location ID
   * @returns {Promise} - { detail: string, total_visits: number }
   */
  unmarkVisited: (locationId) => {
    return api.delete(`/locations/${locationId}/unmark-visited/`);
  },

  /**
   * Toggle visited status for a location
   * @param {number} locationId - Location ID
   * @returns {Promise} - { is_visited: boolean, newly_earned_badges: Array }
   */
  toggleVisited: (locationId) => {
    return api.post(`/locations/${locationId}/toggle-visited/`);
  },

  /**
   * Toggle favorite status for a location
   * @param {number} locationId - Location ID
   * @returns {Promise} - { is_favorited: boolean }
   */
  toggleFavorite: (locationId) => {
    return api.post(`/locations/${locationId}/toggle_favorite/`);
  },

  /**
   * Get random hero carousel images (rotates daily)
   * @returns {Promise} - Array of { id, name, image_url }
   */
  getHeroCarousel: () => {
    return api.get('/locations/hero_carousel/');
  },

  /**
   * Get popular locations near user coordinates
   * Returns reviewed locations first (by rating), then unreviewed (by distance)
   * @param {Object} params - Query parameters
   * @param {number} params.lat - User latitude
   * @param {number} params.lng - User longitude
   * @param {number} params.limit - Max results (default 8)
   * @returns {Promise} - Array of locations
   */
  getPopularNearby: ({ lat, lng, limit = 8 }) => {
    return api.get('/locations/popular_nearby/', { params: { lat, lng, limit } });
  },

  /**
   * Toggle upvote on a photo (location photo or review photo)
   * @param {number} locationId - Location ID
   * @param {string} photoId - Photo ID in format "loc_123" or "rev_456"
   * @returns {Promise} - { upvote_count, user_has_upvoted, photo_id }
   */
  voteOnPhoto: (locationId, photoId) => {
    return api.post(`/locations/${locationId}/photos/${photoId}/vote/`);
  },

  /**
   * Delete a photo (location photo or review photo)
   * @param {number} locationId - Location ID
   * @param {string} photoId - Photo ID in format "loc_123" or "rev_456"
   * @returns {Promise} - { detail: "Photo deleted successfully" }
   */
  deletePhoto: (locationId, photoId) => {
    return api.delete(`/locations/${locationId}/photos/${photoId}/`);
  },

  /**
   * Get photos for a location with cursor-based pagination
   * @param {number} locationId - Location ID
   * @param {Object} params - Query parameters
   * @param {string} params.sort - Sort order: "newest", "oldest", "most_upvoted"
   * @param {string} params.cursor - Pagination cursor (optional)
   * @param {number} params.limit - Page size (default 24, max 50)
   * @returns {Promise} - { results, next_cursor, has_more, total_count }
   */
  getPhotos: (locationId, params = {}) => {
    return api.get(`/locations/${locationId}/photos/`, { params });
  },

  /**
   * Upload photos to a location's gallery
   * @param {number} locationId - Location ID
   * @param {File[]} files - Array of image files to upload (max 5)
   * @returns {Promise} - { detail, photos: [{ id, image_url, thumbnail_url }] }
   */
  addPhotosToLocation: (locationId, files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    return api.post(`/locations/${locationId}/photos/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Submit feedback on AI-generated review summary
   * @param {number} locationId - Location ID
   * @param {boolean} isHelpful - True if helpful, false if not helpful
   * @returns {Promise} - { is_helpful: boolean }
   */
  submitSummaryFeedback: (locationId, isHelpful) => {
    return api.post(`/locations/${locationId}/summary-feedback/`, {
      is_helpful: isHelpful,
    });
  },
};

export default locationsApi;
