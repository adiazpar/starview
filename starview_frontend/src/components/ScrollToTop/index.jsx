/**
 * ScrollToTop Component
 *
 * Handles scroll position on navigation:
 * - Scrolls to top on page refresh
 * - Scrolls to top on forward navigation (clicking links)
 * - Preserves scroll position on browser back/forward buttons
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const isFirstMount = useRef(true);

  useEffect(() => {
    // On first mount (page refresh), always scroll to top
    if (isFirstMount.current) {
      isFirstMount.current = false;
      window.scrollTo(0, 0);
      return;
    }

    // On subsequent navigations:
    // - PUSH/REPLACE (clicking links): scroll to top
    // - POP (browser back/forward): let browser handle scroll restoration
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
}
