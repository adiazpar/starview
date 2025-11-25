/**
 * Alert Component
 *
 * Reusable alert/message component for displaying success, error, warning, and info messages.
 *
 * Props:
 * - type: 'success' | 'error' | 'warning' | 'info' (default: 'info')
 * - message: string - The message to display
 * - onClose: function (optional) - Callback when close button is clicked
 * - showIcon: boolean (default: true) - Show/hide the icon
 */
import './styles.css';

function Alert({ type = 'info', message, onClose, showIcon = true }) {

  // Icon mapping
  const iconMap = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-exclamation',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info',
  };

  const icon = iconMap[type] || iconMap.info;

  return (
    <div className={`alert alert-${type}`}>
      {showIcon && <i className={`alert-icon ${icon}`}></i>}
      <span className="alert-content">{message}</span>
      {onClose && (
        <button
          className="alert-close"
          onClick={onClose}
          aria-label="Close alert"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      )}
    </div>
  );
}

export default Alert;
