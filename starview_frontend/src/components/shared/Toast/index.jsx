/**
 * ToastContainer Component
 *
 * Renders toast notifications from the ToastContext.
 * Place this component once at the app root level.
 */

import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

// Icon mapping for toast types
const iconMap = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
};

function Toast({ id, message, type }) {
  const { dismissToast } = useToast();
  const icon = iconMap[type] || iconMap.info;

  return (
    <div className={`toast toast--${type}`} role="alert">
      <i className={`toast__icon ${icon}`}></i>
      <span className="toast__message">{message}</span>
      <button
        className="toast__close"
        onClick={() => dismissToast(id)}
        aria-label="Dismiss"
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
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}
