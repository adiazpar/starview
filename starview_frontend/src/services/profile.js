/**
 * Profile API Service
 *
 * All API calls related to user profile management.
 * Each function returns a Promise that resolves to the API response.
 *
 * Note: All authenticated profile management endpoints now use /users/me/* pattern
 */

import api from './api';

export const profileApi = {
  /**
   * Get authenticated user's full profile (includes email, private data)
   * @returns {Promise} - Full user profile data
   */
  getMe: () => {
    return api.get('/users/me/');
  },

  /**
   * Upload profile picture
   * @param {File} file - Image file to upload
   * @returns {Promise} - { detail: string, image_url: string }
   */
  uploadProfilePicture: (file) => {
    const formData = new FormData();
    formData.append('profile_picture', file);

    return api.post('/users/me/upload-picture/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Remove profile picture (reset to default)
   * @returns {Promise} - { detail: string, default_image_url: string }
   */
  removeProfilePicture: () => {
    return api.delete('/users/me/remove-picture/');
  },

  /**
   * Update user's first and last name
   * @param {Object} data - Name data
   * @param {string} data.first_name - First name
   * @param {string} data.last_name - Last name
   * @returns {Promise} - { detail: string, first_name: string, last_name: string }
   */
  updateName: (data) => {
    return api.patch('/users/me/update-name/', data);
  },

  /**
   * Update user's username
   * @param {Object} data - Username data
   * @param {string} data.new_username - New username
   * @returns {Promise} - { detail: string, username: string }
   */
  updateUsername: (data) => {
    return api.patch('/users/me/update-username/', data);
  },

  /**
   * Update user's email address
   * @param {Object} data - Email data
   * @param {string} data.new_email - New email address
   * @returns {Promise} - { detail: string, new_email: string }
   */
  updateEmail: (data) => {
    return api.patch('/users/me/update-email/', data);
  },

  /**
   * Update user's password
   * @param {Object} data - Password data
   * @param {string} data.current_password - Current password (optional if no password set)
   * @param {string} data.new_password - New password
   * @returns {Promise} - { detail: string }
   */
  updatePassword: (data) => {
    return api.patch('/users/me/update-password/', data);
  },

  /**
   * Update user's bio
   * @param {Object} data - Bio data
   * @param {string} data.bio - Bio text (max 500 characters)
   * @returns {Promise} - { detail: string, bio: string }
   */
  updateBio: (data) => {
    return api.patch('/users/me/update-bio/', data);
  },

  /**
   * Update user's location
   * @param {Object} data - Location data
   * @param {string} data.location - Location text (max 100 characters)
   * @returns {Promise} - { detail: string, location: string }
   */
  updateLocation: (data) => {
    return api.patch('/users/me/update-location/', data);
  },

  /**
   * Update user's unit preference (metric or imperial)
   * @param {Object} data - Unit preference data
   * @param {string} data.unit_preference - 'metric' or 'imperial'
   * @returns {Promise} - { detail: string, unit_preference: string }
   */
  updateUnitPreference: (data) => {
    return api.patch('/users/me/update-unit-preference/', data);
  },

  /**
   * Get my full badge collection (earned, in-progress, locked)
   * For use on private /profile/badges page
   * @returns {Promise} - { earned: Array, in_progress: Array, locked: Array }
   */
  getMyBadgeCollection: () => {
    return api.get('/users/me/badges/collection/');
  },

  /**
   * Update user's pinned badges (max 3 badges)
   * @param {Object} data - Pinned badge data
   * @param {number[]} data.pinned_badge_ids - Array of badge IDs to pin (max 3)
   * @returns {Promise} - { detail: string, pinned_badge_ids: number[], pinned_badges: Array }
   */
  updatePinnedBadges: (data) => {
    return api.patch('/users/me/badges/pin/', data);
  },

  /**
   * Get user's favorite locations
   * @returns {Promise} - Array of favorite locations
   */
  getFavorites: () => {
    return api.get('/favorite-locations/');
  },

  /**
   * Add a location to favorites
   * @param {number} locationId - Location ID to favorite
   * @returns {Promise} - Created favorite object
   */
  addFavorite: (locationId) => {
    return api.post('/favorite-locations/', { location_id: locationId });
  },

  /**
   * Remove a favorite location
   * @param {number} id - Favorite location ID (not location ID)
   * @returns {Promise} - { detail: string }
   */
  removeFavorite: (id) => {
    return api.delete(`/favorite-locations/${id}/`);
  },

  /**
   * Get user's connected social accounts (Google, etc.)
   * @returns {Promise} - { social_accounts: Array, count: number }
   */
  getSocialAccounts: () => {
    return api.get('/users/me/social-accounts/');
  },

  /**
   * Disconnect a social account
   * @param {number} accountId - Social account ID
   * @returns {Promise} - { detail: string, provider: string }
   */
  disconnectSocialAccount: (accountId) => {
    return api.delete(`/users/me/disconnect-social/${accountId}/`);
  },
};

// ============================================================================
// PUBLIC USER PROFILE API (No authentication required)
// ============================================================================

export const publicUserApi = {
  /**
   * Get public profile for any user by username
   * @param {string} username - Username to fetch
   * @returns {Promise} - Public user profile data (no email)
   */
  getUser: (username) => {
    return api.get(`/users/${username}/`);
  },

  /**
   * Get public reviews for any user by username
   * @param {string} username - Username to fetch reviews for
   * @param {number} page - Page number for pagination
   * @returns {Promise} - Paginated reviews
   */
  getUserReviews: (username, page = 1) => {
    return api.get(`/users/${username}/reviews/?page=${page}`);
  },

  /**
   * Check if authenticated user is following a specific user
   * @param {string} username - Username to check
   * @returns {Promise} - { is_following: boolean, username: string }
   */
  checkFollowStatus: (username) => {
    return api.get(`/users/${username}/is-following/`);
  },

  /**
   * Follow a user
   * @param {string} username - Username to follow
   * @returns {Promise} - { detail: string, is_following: boolean }
   */
  followUser: (username) => {
    return api.post(`/users/${username}/follow/`);
  },

  /**
   * Unfollow a user
   * @param {string} username - Username to unfollow
   * @returns {Promise} - { detail: string, is_following: boolean }
   */
  unfollowUser: (username) => {
    return api.delete(`/users/${username}/follow/`);
  },

  /**
   * Get list of users who follow the specified user
   * @param {string} username - Username to get followers for
   * @param {number} page - Page number for pagination
   * @returns {Promise} - Paginated list of follower users
   */
  getFollowers: (username, page = 1) => {
    return api.get(`/users/${username}/followers/?page=${page}`);
  },

  /**
   * Get list of users that the specified user is following
   * @param {string} username - Username to get following list for
   * @param {number} page - Page number for pagination
   * @returns {Promise} - Paginated list of users being followed
   */
  getFollowing: (username, page = 1) => {
    return api.get(`/users/${username}/following/?page=${page}`);
  },

  /**
   * Get user's PUBLIC badge display (for profile pages)
   * Returns only earned badges - same view for everyone (including profile owner)
   * @param {string} username - Username to get badges for
   * @returns {Promise} - { earned: Array, pinned_badge_ids: number[] }
   */
  getUserBadges: (username) => {
    return api.get(`/users/${username}/badges/`);
  },
};

export default profileApi;
