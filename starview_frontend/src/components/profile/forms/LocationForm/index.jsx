/**
 * LocationForm Component
 *
 * Form component for updating user location.
 * Max 100 characters.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';

function LocationForm({ user, refreshAuth }) {
  const [location, setLocation] = useState(user?.location || '');

  // Update location when user data changes
  useEffect(() => {
    if (user?.location !== undefined) {
      setLocation(user.location || '');
    }
  }, [user?.location]);

  const { loading, error, success, handleSubmit } = useFormSubmit({
    onSubmit: async () => await profileApi.updateLocation({ location }),
    onSuccess: refreshAuth,
    successMessage: 'Location updated successfully!',
  });

  return (
    <div className="profile-form-section">
      <h3 className="profile-form-title">Location</h3>
      <p className="profile-form-description">
        Where are you based? This will be visible on your public profile.
      </p>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

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
          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save"></i>
                Save Location
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LocationForm;
