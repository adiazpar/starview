/**
 * ScrollToTop Component
 *
 * Scrolls to top of page on route changes.
 * Place this component inside BrowserRouter.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
