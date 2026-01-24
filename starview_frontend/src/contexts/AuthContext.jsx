import { createContext, useContext, useState, useEffect, useRef } from 'react';
import authApi from '../services/auth';
import { safeRedirect } from '../utils/security';

/**
 * AuthContext - Shared authentication state across the entire application
 *
 * This context provides a single source of truth for authentication state,
 * preventing multiple redundant API calls to /api/auth/status/.
 *
 * Benefits:
 * - Single API call on app load instead of one per component
 * - Consistent auth state across all components
 * - Easy auth state updates after login/logout/profile changes
 */

const AuthContext = createContext(null);

/**
 * AuthProvider - Wraps the app to provide authentication state
 *
 * Usage in App.jsx:
 *   <AuthProvider>
 *     <BrowserRouter>
 *       <Routes>...</Routes>
 *     </BrowserRouter>
 *   </AuthProvider>
 */
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasInitialized = useRef(false);

  /**
   * Check authentication status
   * Called on initial mount and when explicitly refreshed
   */
  const checkAuthStatus = async () => {
    try {
      const response = await authApi.checkStatus();
      const data = response.data;

      setIsAuthenticated(data.authenticated);
      setUser(data.user);
    } catch (error) {
      console.error('Error checking auth status:', error);
      // If request fails, assume not authenticated
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresh auth state
   * Call this after login, logout, or profile updates
   */
  const refreshAuth = async () => {
    await checkAuthStatus();
  };

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      const response = await authApi.logout();
      const data = response.data;

      // Update local state
      setIsAuthenticated(false);
      setUser(null);

      // Redirect to home page or specified redirect URL (validated to prevent open redirects)
      safeRedirect(data.redirect_url, '/');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Check auth status once on mount
  // Use ref to prevent double-calls in React Strict Mode (development)
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      checkAuthStatus();
    }
  }, []);

  // Listen for 401 unauthorized events from API interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const value = {
    isAuthenticated,
    user,
    loading,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth - Hook to access authentication state
 *
 * Must be used within an AuthProvider.
 *
 * Usage:
 *   const { isAuthenticated, user, loading, logout, refreshAuth } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default AuthContext;
