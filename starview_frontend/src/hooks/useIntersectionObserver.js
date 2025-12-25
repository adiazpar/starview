/**
 * useIntersectionObserver Hook
 *
 * Detects when an element enters the viewport.
 * Used for infinite scroll to trigger loading more content.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Observe when an element enters the viewport
 * @param {Function} callback - Function to call when element is visible
 * @param {Object} options - IntersectionObserver options
 * @returns {Function} Callback ref to attach to the target element
 */
export function useIntersectionObserver(callback, options = {}) {
  const [target, setTarget] = useState(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date without triggering effect
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callbackRef.current();
          }
        });
      },
      { root: null, rootMargin: '100px', threshold: 0, ...options }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [target]);

  // Return a callback ref that updates state when element mounts
  const setRef = useCallback((node) => {
    setTarget(node);
  }, []);

  return setRef;
}

export default useIntersectionObserver;
