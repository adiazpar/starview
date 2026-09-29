/**
 * PersonalInfoForm Component
 *
 * Form component for updating user's first name and last name.
 * Uses view/edit mode pattern for cleaner UX.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../shared/LoadingSpinner';

function PersonalInfoForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [personalInfo, setPersonalInfo] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
  });
  const { showToast } = useToast();

  // Update personal info when user data changes
  useEffect(() => {
    if (user) {
      setPersonalInfo({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
  }, [user]);

  const { loading, handleSubmit } = useFormSubmit({
    onSubmit: async () =>
      await profileApi.updateName({
        first_name: personalInfo.first_name,
        last_name: personalInfo.last_name,
      }),
    onSuccess: () => {
      showToast('Name updated successfully!', 'success');
      refreshAuth();
      setIsEditing(false);
    },
    onError: (err) => {
      const message = err.response?.data?.detail || 'Failed to update name';
      showToast(message, 'error');
    },
  });

  const handleCancel = () => {
    // Reset to original values
    setPersonalInfo({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
    });
    setIsEditing(false);
  };

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Personal Information</h3>
          <p className="profile-form-description">
            Your name helps others recognize you. This will be displayed on your public profile.
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
          aria-label={isEditing ? "Cancel editing" : "Edit personal information"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className={`profile-view-value ${!fullName ? 'profile-view-value--empty' : ''}`}>
            {fullName || 'Not set'}
          </span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="profile-form-row">
              <div className="form-group">
                <label htmlFor="first-name" className="form-label">
                  First Name
                </label>
                <input
                  type="text"
                  id="first-name"
                  className="form-input"
                  value={personalInfo.first_name}
                  onChange={(e) =>
                    setPersonalInfo({ ...personalInfo, first_name: e.target.value })
                  }
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="last-name" className="form-label">
                  Last Name
                </label>
                <input
                  type="text"
                  id="last-name"
                  className="form-input"
                  value={personalInfo.last_name}
                  onChange={(e) =>
                    setPersonalInfo({ ...personalInfo, last_name: e.target.value })
                  }
                  required
                  disabled={loading}
                />
              </div>
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

export default PersonalInfoForm;
