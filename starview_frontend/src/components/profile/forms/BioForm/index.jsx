/**
 * BioForm Component
 *
 * Form component for updating user bio.
 * Uses view/edit mode pattern for cleaner UX.
 * Max 150 characters with character counter.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import './styles.css';

function BioForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState(user?.bio || '');

  // Update bio when user data changes
  useEffect(() => {
    if (user?.bio !== undefined) {
      setBio(user.bio || '');
    }
  }, [user?.bio]);

  const { loading, error, success, handleSubmit, clearMessages } = useFormSubmit({
    onSubmit: async () => await profileApi.updateBio({ bio }),
    onSuccess: () => {
      refreshAuth();
      setIsEditing(false);
    },
    successMessage: 'Bio updated successfully!',
  });

  const handleCancel = () => {
    setBio(user?.bio || '');
    setIsEditing(false);
    clearMessages();
  };

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Bio</h3>
          <p className="profile-form-description">
            Tell others about yourself. This will be visible on your public profile.
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
          aria-label={isEditing ? "Cancel editing" : "Edit bio"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className={`profile-view-value ${!user?.bio ? 'profile-view-value--empty' : ''}`}>
            {user?.bio || 'Not set'}
          </span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <div className="bio-textarea-wrapper">
                <textarea
                  id="bio"
                  className="form-textarea"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows="4"
                  maxLength="150"
                  placeholder="Tell others about yourself..."
                  disabled={loading}
                  aria-label="Bio"
                />
                <span className="bio-character-count">{bio.length}/150</span>
              </div>
            </div>
            <div className="profile-form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
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

export default BioForm;
