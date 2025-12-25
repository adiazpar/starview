/**
 * useRequireAuth Hook
 *
 * Provides a reusable pattern for auth-required actions. When a user attempts
 * an action that requires authentication, this hook redirects them to the login
 * page with a return URL, so they come back to their original page after login.
 *
 * Usage:
 * const { requireAuth } = useRequireAuth();
 *
 * const handleFavorite = () => {
 *   if (!requireAuth()) return;  // Redirects to login if not authenticated
 *   toggleFavorite.mutate(locationId);
 * };
 */

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function useRequireAuth() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Check if user is authenticated. If not, redirect to login with return URL.
   * @param {string} customReturnPath - Optional custom path to return to after login
   * @returns {boolean} true if authenticated, false if redirecting to login
   */
  const requireAuth = useCallback((customReturnPath = null) => {
    if (isAuthenticated) {
      return true;
    }

    // Build the return URL - use custom path or current location
    const returnPath = customReturnPath || location.pathname + location.search;
    const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;

    navigate(loginUrl);
    return false;
  }, [isAuthenticated, navigate, location.pathname, location.search]);

  return {
    requireAuth,
    isAuthenticated,
  };
}

export default useRequireAuth;
