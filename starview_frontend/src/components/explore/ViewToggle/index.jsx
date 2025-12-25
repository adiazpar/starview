/* ViewToggle Component
 * Floating button to switch between list and map views.
 * Positioned at bottom center like AllTrails.
 */

import { memo } from 'react';
import './styles.css';

function ViewToggle({ view, onToggle }) {
  const isMapView = view === 'map';

  return (
    <button
      className="view-toggle"
      onClick={onToggle}
      aria-label={isMapView ? 'Switch to list view' : 'Switch to map view'}
    >
      <i className={`fa-solid ${isMapView ? 'fa-list' : 'fa-map'}`}></i>
      <span>{isMapView ? 'List' : 'Map'}</span>
    </button>
  );
}

export default memo(ViewToggle);
