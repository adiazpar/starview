/**
 * useIntersectionObserver Hook
 *
 * Detects when an element enters the viewport.
 * Used for infinite scroll to trigger loading more content.
 */

import { useEffect, useRef } from 'react';

/**
 * Observe when an element enters the viewport
 * @param {Function} callback - Function to call when element is visible
 * @param {Object} options - IntersectionObserver options
 * @returns {Object} ref to attach to the target element
 */
export function useIntersectionObserver(callback, options = {}) {
  const targetRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date without triggering effect
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callbackRef.current(); // Use ref instead of closure
          }
        });
      },
      { root: null, rootMargin: '100px', threshold: 0, ...options }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, []); // Empty deps - observer created once

  return targetRef;
}

export default useIntersectionObserver;
