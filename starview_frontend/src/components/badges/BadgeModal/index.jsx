import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import BadgeCard from '../BadgeCard';
import './styles.css';

/**
 * BadgeModal - Modal overlay showing full badge details
 *
 * Displays a BadgeCard component in a centered modal with dark overlay.
 * Uses React Portal to render at document.body level, escaping any
 * backdrop-filter containing blocks that would break fixed positioning.
 *
 * Props:
 * - badge: Badge object to display
 * - state: 'earned' | 'in-progress' | 'locked'
 * - earnedAt: ISO date string (for earned badges)
 * - progress: Progress object (for in-progress badges)
 * - onClose: Function to call when modal is closed
 */
function BadgeModal({ badge, state, earnedAt, progress, onClose }) {
  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Handle click on overlay (outside modal content)
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Use Portal to render modal at document.body level
  // This escapes backdrop-filter containing blocks in parent components
  return createPortal(
    <div className="badge-modal-overlay" onClick={handleOverlayClick}>
      <div className="badge-modal-content">
        {/* Close button */}
        <button
          className="badge-modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* Full BadgeCard */}
        <BadgeCard
          badge={badge}
          state={state}
          earnedAt={earnedAt}
          progress={progress}
          canPin={false}
        />
      </div>
    </div>,
    document.body
  );
}

export default BadgeModal;
