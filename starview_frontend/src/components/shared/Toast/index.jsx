/**
 * ToastContainer Component
 *
 * Glass-morphic observatory control panel notifications.
 * Features colored backgrounds/borders and pause-on-hover.
 * Place this component once at the app root level.
 */

import { useState, useEffect, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Icon mapping for toast types
const iconMap = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
};

function Toast({ id, message, type, duration, exiting = false }) {
  const { dismissToast } = useToast();
  const icon = iconMap[type] || iconMap.info;

  // Track remaining time for pause-on-hover
  const [isPaused, setIsPaused] = useState(false);
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef(Date.now());
  const timeoutRef = useRef(null);

  // Set up auto-dismiss timer
  useEffect(() => {
    if (duration <= 0 || exiting) return;

    const startTimer = () => {
      startTimeRef.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        dismissToast(id);
      }, remainingTimeRef.current);
    };

    if (!isPaused) {
      startTimer();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [id, duration, exiting, isPaused, dismissToast]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      // Calculate remaining time
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(remainingTimeRef.current - elapsed, 0);
    }
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  return (
    <div
      className={`toast toast--${type}${exiting ? ' toast--exiting' : ''}`}
      role="alert"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Icon with glow effect */}
      <div className="toast__icon">
        <i className={icon}></i>
      </div>

      {/* Message */}
      <span className="toast__message">{message}</span>

      {/* Close button */}
      <button
        className="toast__close"
        onClick={() => dismissToast(id)}
        aria-label="Dismiss notification"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}
