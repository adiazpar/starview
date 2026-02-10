/**
 * UsernameForm Component
 *
 * Form component for updating username.
 * Uses view/edit mode pattern for cleaner UX.
 * Validates: 3-30 characters, letters, numbers, underscores, and hyphens only.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../shared/LoadingSpinner';

function UsernameForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || '');
  const { showToast } = useToast();

  // Update username when user data changes
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  const { loading, handleSubmit } = useFormSubmit({
    onSubmit: async () =>
      await profileApi.updateUsername({
        new_username: username,
      }),
    onSuccess: () => {
      showToast('Username updated successfully!', 'success');
      refreshAuth();
      setIsEditing(false);
    },
    onError: (err) => {
      const message = err.response?.data?.detail || 'Failed to update username';
      showToast(message, 'error');
    },
  });

  const handleCancel = () => {
    setUsername(user?.username || '');
    setIsEditing(false);
  };

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Username</h3>
          <p className="profile-form-description">
            3-30 characters. Letters, numbers, underscores, and hyphens only.
          </p>
        </div>
        <button
          type="button"
          className="profile-edit-btn"
          onClick={() => {
            if (isEditing) {
              handleCancel();
            } else {
              setIsEditing(true);
            }
          }}
          aria-label={isEditing ? "Cancel editing" : "Edit username"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className="profile-view-value">@{user?.username}</span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <input
                type="text"
                id="username"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter username"
                aria-label="Username"
              />
            </div>
            <div className="profile-form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <LoadingSpinner size="xs" inline />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default UsernameForm;
