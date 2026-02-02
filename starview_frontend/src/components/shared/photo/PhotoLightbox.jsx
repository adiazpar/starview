/* PhotoLightbox Component
 * Shared lightbox modal for displaying photos with attribution and voting.
 * Used by PhotoMosaic and LocationGallery.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../contexts/ToastContext';
import './PhotoLightbox.css';

// Format upload date as "Jan 2024" or similar
function formatUploadDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function PhotoLightbox({
  photo,
  locationName,
  isClosing,
  onClose,
  onVote,
  isVoting = false,
  isOwnPhoto = false,
  onDelete,
  isDeleting = false,
}) {
  const lightboxRef = useRef(null);
  const menuRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const { showToast } = useToast();

  // Handle keyboard escape to close lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showConfirmDelete) {
          setShowConfirmDelete(false);
        } else if (isMenuOpen) {
          setIsMenuOpen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isMenuOpen, showConfirmDelete]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  // Focus lightbox when opened for accessibility
  useEffect(() => {
    if (lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, []);

  const handleVoteClick = useCallback((e) => {
    e.stopPropagation();
    if (isVoting) return;
    onVote(photo.id);
  }, [onVote, photo.id, isVoting]);

  const handleMoreClick = useCallback((e) => {
    e.stopPropagation();
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleReportClick = useCallback((e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    showToast('Coming soon', 'info');
  }, [showToast]);

  const handleDeleteClick = useCallback((e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setShowConfirmDelete(true);
  }, []);

  const handleConfirmDelete = useCallback((e) => {
    e.stopPropagation();
    if (isDeleting || !onDelete) return;
    onDelete(photo.id);
  }, [onDelete, photo.id, isDeleting]);

  const handleCancelDelete = useCallback((e) => {
    e.stopPropagation();
    setShowConfirmDelete(false);
  }, []);

  if (!photo) return null;

  return (
    <div
      ref={lightboxRef}
      className={`photo-lightbox ${isClosing ? 'photo-lightbox--closing' : ''}`}
      onClick={onClose}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
    >
      {/* Image container with overlay bars */}
      <div className="photo-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.full || photo.thumbnail}
          alt={locationName ? `${locationName} photo` : 'Photo'}
        />

        {/* Top Bar - date and close button */}
        <div className="photo-lightbox__bar photo-lightbox__bar--top">
          {photo.uploaded_at && (
            <div className="photo-lightbox__date">
              <span className="photo-lightbox__date-label">Uploaded</span>
              <span className="photo-lightbox__date-value">{formatUploadDate(photo.uploaded_at)}</span>
            </div>
          )}
          <button
            className="photo-lightbox__action photo-lightbox__action--close"
            onClick={onClose}
            aria-label="Close lightbox"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Bottom Bar - attribution and vote button */}
        <div className="photo-lightbox__bar photo-lightbox__bar--bottom">
          {photo.uploaded_by && (
            photo.uploaded_by.is_system_account ? (
              <div className="photo-lightbox__attribution">
                <img
                  src={photo.uploaded_by.profile_picture}
                  alt=""
                  className="photo-lightbox__avatar"
                />
                <div className="photo-lightbox__user-info">
                  <span className="photo-lightbox__display-name">{photo.uploaded_by.display_name}</span>
                  <span className="photo-lightbox__username">@{photo.uploaded_by.username}</span>
                </div>
              </div>
            ) : (
              <Link
                to={`/profile/${photo.uploaded_by.username}`}
                className="photo-lightbox__attribution"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={photo.uploaded_by.profile_picture}
                  alt=""
                  className="photo-lightbox__avatar"
                />
                <div className="photo-lightbox__user-info">
                  <span className="photo-lightbox__display-name">{photo.uploaded_by.display_name}</span>
                  <span className="photo-lightbox__username">@{photo.uploaded_by.username}</span>
                </div>
              </Link>
            )
          )}
          <div className="photo-lightbox__actions">
            {onVote && (
              isOwnPhoto ? (
                /* Show vote count only for own photos (can't vote on own photo) */
                photo.upvote_count > 0 && (
                  <div className="photo-lightbox__action photo-lightbox__action--vote photo-lightbox__action--disabled">
                    <i className="fa-solid fa-thumbs-up"></i>
                    <span className="photo-lightbox__vote-count">{photo.upvote_count}</span>
                  </div>
                )
              ) : (
                <button
                  className={`photo-lightbox__action photo-lightbox__action--vote ${photo.user_has_upvoted ? 'photo-lightbox__action--active' : ''}`}
                  onClick={handleVoteClick}
                  disabled={isVoting}
                  aria-label={photo.user_has_upvoted ? 'Remove upvote' : 'Upvote photo'}
                >
                  <i className={`fa-${photo.user_has_upvoted ? 'solid' : 'regular'} fa-thumbs-up`}></i>
                  {photo.upvote_count > 0 && (
                    <span className="photo-lightbox__vote-count">{photo.upvote_count}</span>
                  )}
                </button>
              )
            )}
            <div className="photo-lightbox__menu-wrapper" ref={menuRef}>
              <button
                className="photo-lightbox__action photo-lightbox__action--more"
                onClick={handleMoreClick}
                aria-label="More options"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
              >
                <i className="fa-solid fa-ellipsis"></i>
              </button>

              {isMenuOpen && (
                <ul className="photo-lightbox__menu" role="menu">
                  <li
                    className="photo-lightbox__menu-item"
                    onClick={handleReportClick}
                    role="menuitem"
                  >
                    Report image
                  </li>
                  {isOwnPhoto && onDelete && (
                    <li
                      className="photo-lightbox__menu-item"
                      onClick={handleDeleteClick}
                      role="menuitem"
                    >
                      Delete
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showConfirmDelete && (
        <div
          className="photo-lightbox__confirm-overlay"
          onClick={handleCancelDelete}
        >
          <div
            className="photo-lightbox__confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc"
          >
            <h3 id="delete-dialog-title">Delete Photo</h3>
            <p id="delete-dialog-desc">
              Are you sure you want to delete this photo? This action cannot be undone.
            </p>
            <div className="photo-lightbox__confirm-actions">
              <button
                className="photo-lightbox__confirm-btn photo-lightbox__confirm-btn--cancel"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="photo-lightbox__confirm-btn photo-lightbox__confirm-btn--delete"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoLightbox;
