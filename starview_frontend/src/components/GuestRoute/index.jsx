import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * GuestRoute Component
 *
 * Wrapper component for routes that should only be accessible to unauthenticated users.
 * Redirects to home page if user is already logged in.
 *
 * Usage:
 *   <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
 */
function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  // While loading, don't redirect yet - wait to know auth state
  if (loading) {
    return children;
  }

  // Redirect to home if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // User is not authenticated, render the guest content
  return children;
}

export default GuestRoute;
