import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * ProtectedRoute Component
 *
 * Wrapper component that protects routes requiring authentication.
 * Redirects to login page with ?next parameter for post-login redirect.
 *
 * Usage:
 *   <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // While loading, render children - they will see auth loading state via useAuth
  // This prevents spinner flash - ProfilePage shows one unified spinner for both auth and data loading
  if (loading) {
    return children;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save current location to redirect back after login
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // User is authenticated, render the protected content
  return children;
}

export default ProtectedRoute;
