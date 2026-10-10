/**
 * Authentication API Service
 *
 * All API calls related to user authentication and account management.
 * Each function returns a Promise that resolves to the API response.
 */

import api from './api';

export const authApi = {
  getSecurityStatus: () => api.get('/auth/security/'),
  confirmIdentity: (data) => api.post('/auth/security/', data),
  sendConfirmationCode: (method = 'email_code') => api.post('/auth/security/code/', { method }),
  getSecurityMethods: () => api.get('/auth/security/methods/'),
  updateSecurityMethods: (data) => api.post('/auth/security/methods/', data),
  getRecoveryCodes: () => api.get('/auth/security/recovery-codes/'),
  getProviders: () => api.get('/auth/providers/'),

  async startSocialLogin(provider, { process = 'login', next = '/', rememberMe = false } = {}) {
    if (!['apple', 'google'].includes(provider)) throw new Error('Invalid login provider');
    if (!['login', 'connect'].includes(process)) throw new Error('Invalid login process');
    const { data } = await api.get('/auth/providers/');
    if (provider === 'apple' && !data.apple) throw new Error('Apple sign-in is unavailable');
    // A form navigation preserves Django CSRF protection and follows the provider redirect.
    const form = document.createElement('form');
    form.hidden = true;
    form.method = 'POST';
    form.action = `/accounts/${provider}/login/`;
    const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';
    for (const [name, value] of Object.entries({ process, next: safeNext, remember_me: rememberMe === true ? 'true' : 'false', csrfmiddlewaretoken: data.csrf_token })) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    // Chrome completes form navigation asynchronously; keep it attached until unload.
    try { form.submit(); } catch (error) { form.remove(); throw error; }
  },

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
   * @param {string} [data.birth_date] - Optional private date of birth as YYYY-MM-DD; omit it to register without one
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
   * @returns {Promise} - { detail: string, resend_after: number }
   */
  resendVerificationEmail: (data) => {
    return api.post('/auth/resend-verification/', data);
  },
};

export default authApi;
