import { useLocation } from 'react-router-dom';
import ErrorBoundary from './index';

/** A failed page must not keep the next route behind its error screen. */
export default function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();

  // Query/filter changes within a healthy page keep its component state.
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
