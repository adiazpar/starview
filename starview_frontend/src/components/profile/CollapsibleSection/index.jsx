import { useState } from 'react';
import './styles.css';

/**
 * CollapsibleSection - Reusable collapsible section component
 *
 * Uses CSS Grid animation technique for smooth expand/collapse
 * Similar to BadgeSection component
 */
function CollapsibleSection({ title, defaultExpanded = true, children }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="collapsible-section">
      <button
        className="collapsible-section-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <h3>{title}</h3>
        <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
      </button>
      <div className={`collapsible-section-content ${!isExpanded ? 'collapsing' : ''}`}>
        <div className="collapsible-section-content-inner">
          <div className="collapsible-section-content-padded">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CollapsibleSection;
