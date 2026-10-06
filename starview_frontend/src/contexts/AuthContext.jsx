import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import authApi from '../services/auth';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../services/queryClient';
import { advanceIdentityEpoch } from '../services/identityEpoch';
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
  const [queryClient, setQueryClient] = useState(createQueryClient);
  const currentClient = useRef(queryClient);
  const identity = useRef(undefined);
  const statusVersion = useRef(0);

  const setIdentity = useCallback((nextUser) => {
    const nextId = nextUser?.id ?? null;
    if (identity.current !== nextId) {
      identity.current = nextId;
      advanceIdentityEpoch();
      // Late mutation callbacks retain the old client. They cannot repopulate
      // the next account's cache, even if an optimistic rollback runs later.
      void currentClient.current.cancelQueries();
      currentClient.current.clear();
      currentClient.current = createQueryClient();
      setQueryClient(currentClient.current);
    }
  }, []);

  /**
   * Check authentication status
   * Called on initial mount and when explicitly refreshed
   */
  const checkAuthStatus = useCallback(async () => {
    const version = ++statusVersion.current;
    try {
      const response = await authApi.checkStatus();
      const data = response.data;

      if (version !== statusVersion.current) return;
      setIdentity(data.authenticated ? data.user : null);
      if (version !== statusVersion.current) return;
      setIsAuthenticated(data.authenticated);
      setUser(data.user);
    } catch {
      if (version !== statusVersion.current) return;
      setIdentity(null);
      if (version !== statusVersion.current) return;
      // If request fails, assume not authenticated
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      if (version === statusVersion.current) setLoading(false);
    }
  }, [setIdentity]);

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

      ++statusVersion.current;
      setIdentity(null);
      try { localStorage.setItem('starview:auth-change', String(Date.now())); } catch { /* Storage can be disabled. */ }
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
  }, [checkAuthStatus]);

  // Recheck the shared session when returning to a tab or another tab logs out.
  useEffect(() => {
    const onFocus = () => { checkAuthStatus(); };
    const onStorage = (event) => { if (event.key === 'starview:auth-change') checkAuthStatus(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [checkAuthStatus]);

  // Listen for 401 unauthorized events from API interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      ++statusVersion.current;
      setIdentity(null);
      setIsAuthenticated(false);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [setIdentity]);

  const value = {
    isAuthenticated,
    user,
    loading,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>
    <QueryClientProvider client={queryClient} key={user?.id ?? 'anonymous'}>
      {children}
    </QueryClientProvider>
  </AuthContext.Provider>;
}

/**
 * useAuth - Hook to access authentication state
 *
 * Must be used within an AuthProvider.
 *
 * Usage:
 *   const { isAuthenticated, user, loading, logout, refreshAuth } = useAuth();
 */
// Preserve the existing shared provider/hook API used throughout the app.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default AuthContext;
