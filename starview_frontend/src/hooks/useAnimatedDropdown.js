import { useState, useCallback } from 'react';

/**
 * Custom hook for managing animated dropdown state.
 * Handles open/close state with CSS animation timing.
 *
 * @param {number} animationDuration - Duration of close animation in ms
 * @returns {Object} Dropdown state and controls
 */
export function useAnimatedDropdown(animationDuration = 100) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    if (!isOpen) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, animationDuration);
  }, [isOpen, animationDuration]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  return { isOpen, isClosing, open, close, toggle };
}
