/**
 * Authentication API Service
 *
 * All API calls related to user authentication and account management.
 * Each function returns a Promise that resolves to the API response.
 */

import api from './api';

export const authApi = {
  /**
   * Check authentication status
   * @returns {Promise} - { authenticated: boolean, user: Object|null }
   */
  checkStatus: () => {
    return api.get('/auth/status/');
  },

  /**
   * Register a new user
   * @param {Object} data - Registration data
   * @param {string} data.username - Username
   * @param {string} data.email - Email address
   * @param {string} data.first_name - First name
   * @param {string} data.last_name - Last name
   * @param {string} data.password1 - Password
   * @param {string} data.password2 - Password confirmation
   * @returns {Promise} - { detail: string, redirect_url: string }
   */
  register: (data) => {
    return api.post('/auth/register/', data);
  },

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.username - Username or email
   * @param {string} credentials.password - Password
   * @param {string} [credentials.next] - Optional redirect URL after login
   * @param {boolean} [credentials.remember_me] - Keep user logged in for 30 days
   * @returns {Promise} - { detail: string, redirect_url: string }
   */
  login: (credentials) => {
    return api.post('/auth/login/', credentials);
  },

  /**
   * Logout current user
   * @returns {Promise} - { detail: string, redirect_url: string }
   */
  logout: () => {
    return api.post('/auth/logout/');
  },

  /**
   * Request password reset email
   * @param {Object} data - Password reset request data
   * @param {string} data.email - User's email address
   * @param {string} [data.language] - Optional UI language code for email localization
   * @returns {Promise} - { detail: string, email_sent: boolean }
   */
  requestPasswordReset: (data) => {
    return api.post('/auth/password-reset/', data);
  },

  /**
   * Confirm password reset with token
   * @param {string} uidb64 - Base64-encoded user ID
   * @param {string} token - Password reset token
   * @param {Object} data - New password data
   * @param {string} data.password1 - New password
   * @param {string} data.password2 - Password confirmation
   * @returns {Promise} - { detail: string, success: boolean }
   */
  confirmPasswordReset: (uidb64, token, data) => {
    return api.post(`/auth/password-reset-confirm/${uidb64}/${token}/`, data);
  },

  /**
   * Resend email verification link
   * @param {Object} data - Email data
   * @param {string} data.email - User's email address
   * @returns {Promise} - { detail: string, email_sent: boolean }
   */
  resendVerificationEmail: (data) => {
    return api.post('/auth/resend-verification/', data);
  },
};

export default authApi;
