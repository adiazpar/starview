/**
 * LocationForm Component
 *
 * Form component for updating user location.
 * Uses view/edit mode pattern for cleaner UX.
 * Max 100 characters.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';

function LocationForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [location, setLocation] = useState(user?.location || '');

  // Update location when user data changes
  useEffect(() => {
    if (user?.location !== undefined) {
      setLocation(user.location || '');
    }
  }, [user?.location]);

  const { loading, error, success, handleSubmit, clearMessages } = useFormSubmit({
    onSubmit: async () => await profileApi.updateLocation({ location }),
    onSuccess: () => {
      refreshAuth();
      setIsEditing(false);
    },
    successMessage: 'Location updated successfully!',
  });

  const handleCancel = () => {
    setLocation(user?.location || '');
    setIsEditing(false);
    clearMessages();
  };

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Location</h3>
          <p className="profile-form-description">
            Where are you based? This will be visible on your public profile.
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
          aria-label={isEditing ? "Cancel editing" : "Edit location"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className={`profile-view-value ${!user?.location ? 'profile-view-value--empty' : ''}`}>
            {user?.location || 'Not set'}
          </span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <input
                type="text"
                id="location"
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength="100"
                placeholder="e.g., Seattle, WA"
                disabled={loading}
                aria-label="Location"
              />
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

export default LocationForm;
