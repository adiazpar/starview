/**
 * BioForm Component
 *
 * Form component for updating user bio.
 * Max 150 characters with character counter.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import './styles.css';

function BioForm({ user, refreshAuth }) {
  const [bio, setBio] = useState(user?.bio || '');

  // Update bio when user data changes
  useEffect(() => {
    if (user?.bio !== undefined) {
      setBio(user.bio || '');
    }
  }, [user?.bio]);

  const { loading, error, success, handleSubmit } = useFormSubmit({
    onSubmit: async () => await profileApi.updateBio({ bio }),
    onSuccess: refreshAuth,
    successMessage: 'Bio updated successfully!',
  });

  return (
    <div className="profile-form-section">
      <h3 className="profile-form-title">Bio</h3>
      <p className="profile-form-description">
        Tell others about yourself. This will be visible on your public profile.
      </p>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

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
          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save"></i>
                Save Bio
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BioForm;
