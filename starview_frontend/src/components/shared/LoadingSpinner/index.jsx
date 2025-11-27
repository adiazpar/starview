/**
 * LoadingSpinner Component
 *
 * Reusable loading spinner component for displaying loading states.
 * Uses Font Awesome spinner icon with consistent styling.
 *
 * Props:
 * - size: 'sm' | 'md' | 'lg' (default: 'md')
 * - message: string (optional) - Loading message to display below spinner
 * - fullPage: boolean (default: false) - If true, centers in full viewport
 */

import './styles.css';

function LoadingSpinner({ size = 'md', message = '', fullPage = false }) {
  const sizeClass = `loading-spinner-${size}`;
  const containerClass = fullPage ? 'loading-spinner-container full-page' : 'loading-spinner-container';

  return (
    <div className={containerClass}>
      <i className={`fa-solid fa-spinner fa-spin-pulse ${sizeClass}`}></i>
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
