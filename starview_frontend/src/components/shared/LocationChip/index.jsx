/**
 * LocationChip Component
 *
 * Tappable location indicator for sky page heroes.
 * Shows current location with source icon and opens LocationModal on click.
 *
 * Props:
 * - onClick: () => void - Called when chip is clicked (opens modal)
 */

import { useLocation } from '../../../contexts/LocationContext';
import './styles.css';

function LocationChip({ onClick }) {
  const { location, source, isLoading } = useLocation();

  // Loading state
  if (isLoading) {
    return (
      <button className="location-chip location-chip--loading" disabled>
        <i className="fa-solid fa-spinner fa-spin location-chip__icon"></i>
        <span className="location-chip__text">Finding location...</span>
      </button>
    );
  }

  // No location state
  if (!location) {
    return (
      <button className="location-chip location-chip--prompt" onClick={onClick}>
        <i className="fa-solid fa-location-dot location-chip__icon"></i>
        <span className="location-chip__text">Set location</span>
        <i className="fa-solid fa-chevron-down location-chip__chevron"></i>
      </button>
    );
  }

  // Get source icon
  const getSourceIcon = () => {
    switch (source) {
      case 'browser':
        return 'fa-solid fa-location-crosshairs';
      case 'ip':
        return 'fa-solid fa-location-dot';
      case 'search':
        return 'fa-solid fa-magnifying-glass';
      default:
        return 'fa-solid fa-location-dot';
    }
  };

  return (
    <button className="location-chip" onClick={onClick}>
      <i className={`${getSourceIcon()} location-chip__icon`}></i>
      <span className="location-chip__text">
        {location.name || 'Your location'}
      </span>
      <i className="fa-solid fa-chevron-down location-chip__chevron"></i>
    </button>
  );
}

export default LocationChip;
