/**
 * LoadingSpinner Component
 *
 * Reusable loading spinner component for displaying loading states.
 * Uses animated SVG ripple effect with consistent styling.
 *
 * Props:
 * - size: 'xs' | 'sm' | 'md' | 'lg' (default: 'md')
 * - message: string (optional) - Loading message to display below spinner
 * - fullPage: boolean (default: false) - If true, centers in full viewport
 * - inline: boolean (default: false) - If true, renders without container padding
 */

import './styles.css';

function LoadingSpinner({ size = 'md', message = '', fullPage = false, inline = false }) {
  const sizeClass = `loading-spinner-${size}`;

  const svg = (
    <svg
      className={`loading-spinner-svg ${sizeClass}`}
      viewBox="0 0 44 44"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none" fillRule="evenodd" strokeWidth="2" stroke="currentColor">
        <circle cx="22" cy="22" r="1">
          <animate
            attributeName="r"
            begin="0s"
            dur="1.8s"
            values="1; 20"
            calcMode="spline"
            keyTimes="0; 1"
            keySplines="0.165, 0.84, 0.44, 1"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            begin="0s"
            dur="1.8s"
            values="1; 0"
            calcMode="spline"
            keyTimes="0; 1"
            keySplines="0.3, 0.61, 0.355, 1"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="22" cy="22" r="1">
          <animate
            attributeName="r"
            begin="-0.9s"
            dur="1.8s"
            values="1; 20"
            calcMode="spline"
            keyTimes="0; 1"
            keySplines="0.165, 0.84, 0.44, 1"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            begin="-0.9s"
            dur="1.8s"
            values="1; 0"
            calcMode="spline"
            keyTimes="0; 1"
            keySplines="0.3, 0.61, 0.355, 1"
            repeatCount="indefinite"
          />
        </circle>
      </g>
    </svg>
  );

  // Inline mode: just the SVG, no container
  if (inline) {
    return svg;
  }

  const containerClass = fullPage
    ? 'loading-spinner-container full-page'
    : 'loading-spinner-container';

  return (
    <div className={containerClass}>
      {svg}
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
