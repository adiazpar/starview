/**
 * LocationForm Component
 *
 * Form component for updating user location for public profile display.
 * Uses Mapbox autocomplete for city/region search.
 * Uses view/edit mode pattern for cleaner UX.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import profileApi from '../../../../services/profile';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import { useToast } from '../../../../contexts/ToastContext';

// Lazy load Mapbox autocomplete (185 kB) - only loads when user clicks Edit
const LocationAutocomplete = lazy(() => import('../../../shared/LocationAutocomplete'));

function LocationForm({ user, refreshAuth, scrollTo = false }) {
  const [isEditing, setIsEditing] = useState(false);
  const sectionRef = useRef(null);
  const [locationText, setLocationText] = useState(user?.location || '');
  const { showToast } = useToast();

  // Update location when user data changes
  useEffect(() => {
    if (user?.location !== undefined) {
      setLocationText(user.location || '');
    }
  }, [user?.location]);

  // Scroll to this section when linked from another page
  useEffect(() => {
    if (scrollTo && sectionRef.current) {
      // Small delay to ensure collapsible section is expanded
      setTimeout(() => {
        sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [scrollTo]);

  const { loading, handleSubmit } = useFormSubmit({
    onSubmit: async () => await profileApi.updateLocation({ location: locationText }),
    onSuccess: () => {
      showToast('Location updated successfully!', 'success');
      refreshAuth();
      setIsEditing(false);
    },
    onError: (err) => {
      const message = err.response?.data?.detail || 'Failed to update location';
      showToast(message, 'error');
    },
  });

  // Handle location selection from autocomplete
  const handleLocationSelect = useCallback((data) => {
    setLocationText(data.location);
  }, []);

  const handleCancel = () => {
    setLocationText(user?.location || '');
    setIsEditing(false);
  };

  return (
    <div className="profile-form-section" ref={sectionRef}>
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Location</h3>
          <p className="profile-form-description">
            Where are you based? This is displayed on your public profile.
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
              <Suspense fallback={
                <div className="form-input" style={{ color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> Loading location search...
                </div>
              }>
                <LocationAutocomplete
                  value={locationText}
                  onSelect={handleLocationSelect}
                  placeholder="Search for a city or region..."
                  disabled={loading}
                />
              </Suspense>
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
