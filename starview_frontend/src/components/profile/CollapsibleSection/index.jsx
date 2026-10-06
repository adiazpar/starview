import { useState, useCallback, useId } from 'react';
import './styles.css';

/**
 * CollapsibleSection - Reusable collapsible section component
 *
 * Uses CSS Grid animation technique for smooth expand/collapse
 * Similar to BadgeSection component
 *
 * resetOnCollapse: When true, remounts children on collapse to reset their state
 */
function CollapsibleSection({ title, icon, defaultExpanded = true, resetOnCollapse = false, children }) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [resetKey, setResetKey] = useState(0);

  const handleToggle = useCallback(() => {
    if (isExpanded && resetOnCollapse) {
      // Section is collapsing - increment key to reset children
      setResetKey(prev => prev + 1);
    }
    setIsExpanded(!isExpanded);
  }, [isExpanded, resetOnCollapse]);

  return (
    <div className="collapsible-section">
      <button
        className="collapsible-section-header glass-card"
        onClick={handleToggle}
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <span className="collapsible-section-label">
          {icon && <i className={`fa-solid ${icon} collapsible-section-icon`} aria-hidden="true" />}
          <span>{title}</span>
        </span>
        <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      <div id={contentId} inert={!isExpanded} className={`collapsible-section-content ${!isExpanded ? 'collapsing' : ''}`}>
        <div className="collapsible-section-content-inner">
          <div className="collapsible-section-content-padded" key={resetOnCollapse ? resetKey : undefined}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CollapsibleSection;
