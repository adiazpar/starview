/**
 * LocationForm Component
 *
 * Form component for updating user location with Mapbox autocomplete.
 * Stores location text (public) and coordinates (private).
 * Uses view/edit mode pattern for cleaner UX.
 */

import { useState, useEffect, useCallback } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import LocationAutocomplete from '../../../shared/LocationAutocomplete';

function LocationForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [locationData, setLocationData] = useState({
    location: user?.location || '',
    latitude: null,
    longitude: null
  });

  // Update location when user data changes
  useEffect(() => {
    if (user?.location !== undefined) {
      setLocationData(prev => ({
        ...prev,
        location: user.location || ''
      }));
    }
  }, [user?.location]);

  const { loading, error, success, handleSubmit, clearMessages } = useFormSubmit({
    onSubmit: async () => await profileApi.updateLocation(locationData),
    onSuccess: () => {
      refreshAuth();
      setIsEditing(false);
    },
    successMessage: 'Location updated successfully!',
  });

  // Handle location selection from autocomplete
  const handleLocationSelect = useCallback((data) => {
    setLocationData({
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude
    });
  }, []);

  const handleCancel = () => {
    setLocationData({
      location: user?.location || '',
      latitude: null,
      longitude: null
    });
    setIsEditing(false);
    clearMessages();
  };

  return (
    <div className="profile-form-section">
      {/* Alerts above section title */}
      {success && <Alert type="success" message={success} onClose={clearMessages} />}
      {error && <Alert type="error" message={error} onClose={clearMessages} />}

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
              <LocationAutocomplete
                value={locationData.location}
                onSelect={handleLocationSelect}
                placeholder="Search for a city or region..."
                disabled={loading}
              />
            </div>
            <div className="profile-form-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
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
