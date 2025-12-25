/**
 * useMediaQuery Hook
 *
 * Reactive CSS media query detection.
 * Returns true when the query matches, false otherwise.
 * Handles SSR by defaulting to false on initial render.
 */

import { useState, useEffect } from 'react';

/**
 * Subscribe to a CSS media query
 * @param {string} query - CSS media query string (e.g., "(min-width: 1024px)")
 * @returns {boolean} Whether the media query matches
 */
export function useMediaQuery(query) {
  // Initialize with actual value to prevent flash/race conditions
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handleChange = (event) => setMatches(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/**
 * Convenience hook for desktop detection
 * @returns {boolean} True if screen width >= 1024px
 */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}

export default useMediaQuery;
