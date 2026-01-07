/**
 * ToastContext
 *
 * Global toast notification system. Provides showToast() function
 * that can be called from anywhere in the app.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Message here', 'success'); // success, error, warning, info
 */

import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

// Animation duration must match CSS (toastExit animation)
const EXIT_ANIMATION_DURATION = 200;

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    // First, mark toast as exiting to trigger animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );

    // Then remove after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_DURATION);
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;

    // Replace any existing toasts immediately
    setToasts([{ id, message, type, duration, exiting: false }]);

    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
