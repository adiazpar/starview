/**
 * PersonalInfoForm Component
 *
 * Form component for updating user's first name and last name.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';

function PersonalInfoForm({ user, refreshAuth }) {
  const [personalInfo, setPersonalInfo] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
  });

  // Update personal info when user data changes
  useEffect(() => {
    if (user) {
      setPersonalInfo({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
  }, [user]);

  const { loading, error, success, handleSubmit } = useFormSubmit({
    onSubmit: async () =>
      await profileApi.updateName({
        first_name: personalInfo.first_name,
        last_name: personalInfo.last_name,
      }),
    onSuccess: refreshAuth,
    successMessage: 'Name updated successfully!',
  });

  return (
    <div className="profile-form-section">
      <h3 className="profile-form-title">Personal Information</h3>
      <p className="profile-form-description">
        Your name helps others recognize you. This will be displayed on your public profile.
      </p>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

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
          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save"></i>
                Save Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PersonalInfoForm;
