import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './styles.css';

/**
 * ProfilePictureModal - Modal overlay showing full profile picture
 *
 * Displays a user's profile picture in a centered modal with dark overlay.
 * Uses React Portal to render at document.body level, escaping any
 * backdrop-filter containing blocks that would break fixed positioning.
 *
 * Props:
 * - imageUrl: URL of the profile picture to display
 * - username: Username for alt text
 * - onClose: Function to call when modal is closed
 */
function ProfilePictureModal({ imageUrl, username, onClose }) {
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

  // Handle click on overlay (outside modal content)
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Use Portal to render modal at document.body level
  // This escapes backdrop-filter containing blocks in parent components
  return createPortal(
    <div className="profile-picture-modal-overlay" onClick={handleOverlayClick}>
      <div className="profile-picture-modal-content">
        {/* Close button */}
        <button
          className="profile-picture-modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* Profile Picture */}
        <div className="profile-picture-modal-image-container">
          <img
            src={imageUrl}
            alt={`${username}'s profile picture`}
            className="profile-picture-modal-image"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ProfilePictureModal;
