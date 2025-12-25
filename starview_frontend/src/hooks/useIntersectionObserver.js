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

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback();
          }
        });
      },
      {
        root: null, // viewport
        rootMargin: '100px', // trigger 100px before element is visible
        threshold: 0,
        ...options,
      }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [callback, options]);

  return targetRef;
}

export default useIntersectionObserver;
