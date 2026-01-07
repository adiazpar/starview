/**
 * LocationForm Component
 *
 * Form component for updating user location with Mapbox autocomplete.
 * Stores location text (public) and coordinates (private).
 * Uses view/edit mode pattern for cleaner UX.
 * Shows which location source is being used for map features.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import profileApi from '../../../../services/profile';
import useFormSubmit from '../../../../hooks/useFormSubmit';
import { useUserLocation } from '../../../../hooks/useUserLocation';
import { useToast } from '../../../../contexts/ToastContext';

// Lazy load Mapbox autocomplete (185 kB) - only loads when user clicks Edit
const LocationAutocomplete = lazy(() => import('../../../shared/LocationAutocomplete'));

function LocationForm({ user, refreshAuth, scrollTo = false }) {
  const [isEditing, setIsEditing] = useState(false);
  const sectionRef = useRef(null);
  const [locationData, setLocationData] = useState({
    location: user?.location || '',
    latitude: null,
    longitude: null
  });
  const { source: locationSource, isLoading: locationLoading } = useUserLocation();
  const { showToast } = useToast();

  // Update location when user data changes
  useEffect(() => {
    if (user?.location !== undefined) {
      setLocationData(prev => ({
        ...prev,
        location: user.location || ''
      }));
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
    onSubmit: async () => await profileApi.updateLocation(locationData),
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
  };

  return (
    <div className="profile-form-section" ref={sectionRef}>
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

          {/* Location Source Indicator */}
          {!locationLoading && (
            <div className="location-source-hint">
              {locationSource === 'browser' && (
                <span>Using your browser's location to show distances, day/night map lighting, and nearby locations.</span>
              )}
              {locationSource === 'profile' && (
                <span>Using this location to show distances, day/night map lighting, and nearby locations.</span>
              )}
              {!locationSource && !user?.location && (
                <span>Set a location to see distances to stargazing spots, day/night map lighting, and nearby locations.</span>
              )}
              {!locationSource && user?.location && (
                <span>Location coordinates missing — edit and re-save to enable distances and map features.</span>
              )}
            </div>
          )}
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
                  value={locationData.location}
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
