/**
 * UsernameForm Component
 *
 * Form component for updating username.
 * Validates: 3-30 characters, letters, numbers, underscores, and hyphens only.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';

function UsernameForm({ user, refreshAuth }) {
  const [username, setUsername] = useState(user?.username || '');

  // Update username when user data changes
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  const { loading, error, success, handleSubmit } = useFormSubmit({
    onSubmit: async () =>
      await profileApi.updateUsername({
        new_username: username,
      }),
    onSuccess: refreshAuth,
    successMessage: 'Username updated successfully!',
  });

  return (
    <div className="profile-form-section">
      <h3 className="profile-form-title">Username</h3>
      <p className="profile-form-description">
        3-30 characters. Letters, numbers, underscores, and hyphens only.
      </p>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

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
          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Updating...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save"></i>
                Update Username
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default UsernameForm;
