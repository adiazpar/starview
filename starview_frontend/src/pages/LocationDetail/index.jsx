/* LocationDetail Page
 * Central hub for viewing a single stargazing location.
 * Observatory control room aesthetic with editorial asymmetry.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useLocation } from '../../hooks/useLocations';
import { useSEO } from '../../hooks/useSEO';
import LocationHero from '../../components/location/LocationHero';
import SkyQualityPanel from '../../components/location/SkyQualityPanel';
import LocationAbout from '../../components/location/LocationAbout';
import PhotoMosaic from '../../components/location/PhotoMosaic';
import CommunityStats from '../../components/location/CommunityStats';
import LocationMap from '../../components/location/LocationMap';
import LocationActions from '../../components/location/LocationActions';
import ReviewSection from '../../components/location/ReviewSection';
import RatingSummary from '../../components/location/RatingSummary';
import './styles.css';

function LocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, isLoading, isError, error } = useLocation(id);

  // Set SEO meta tags
  useSEO({
    title: location ? `${location.name} | Starview` : 'Location | Starview',
    description: location
      ? `Explore ${location.name} - a ${location.location_type_display || 'stargazing location'} in ${location.administrative_area || location.country || 'unknown location'}. Bortle class ${location.bortle_class || 'N/A'}.`
      : 'Discover this stargazing location on Starview.',
    path: `/locations/${id}`,
  });

  const handleBack = () => {
    // Check if there's history to go back to
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/explore');
    }
  };

  // Loading state - return null to let Suspense handle loading
  // This prevents double spinner: Suspense shows spinner during code loading,
  // then we'd show another identical spinner during data loading
  if (isLoading) {
    return null;
  }

  // Error state
  if (isError) {
    return (
      <div className="location-detail location-detail--error">
        <div className="location-detail__error-content glass-card">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <h2>Location Not Found</h2>
          <p>{error?.message || 'This location may have been removed or does not exist.'}</p>
          <button className="btn-primary" onClick={() => navigate('/explore')}>
            Explore Locations
          </button>
        </div>
      </div>
    );
  }

  // No location found
  if (!location) {
    return null;
  }

  return (
    <div className="location-detail">
      {/* Hero Section with full-bleed image */}
      <LocationHero
        location={location}
        onBack={handleBack}
      />

      {/* Main Content */}
      <div className="location-detail__content">
        {/* Desktop: Two-column layout */}
        <div className="location-detail__main">
          {/* Sky Quality Dashboard - Mobile only (desktop shows in sidebar) */}
          <div className="location-detail__sky-quality--mobile">
            <SkyQualityPanel
              bortle={location.bortle_class}
              sqm={location.bortle_sqm}
              elevation={location.elevation}
            />
          </div>

          {/* About Section */}
          <LocationAbout location={location} />

          {/* Photo Gallery */}
          {location.images?.length > 0 && (
            <div id="photo-gallery">
              <PhotoMosaic images={location.images} locationName={location.name} />
            </div>
          )}

          {/* Map Section - Mobile only */}
          <div className="location-detail__map--mobile">
            <LocationMap location={location} />
          </div>

          {/* Community Stats - Mobile only */}
          <div className="location-detail__community--mobile">
            <CommunityStats location={location} />
          </div>

          {/* Rating Summary */}
          <RatingSummary location={location} />

          {/* Reviews Section */}
          <ReviewSection locationId={location.id} reviews={location.reviews} />
        </div>

        {/* Desktop Sidebar - Sticky */}
        <aside className="location-detail__sidebar">
          {/* Sky Quality Panel */}
          <SkyQualityPanel
            bortle={location.bortle_class}
            sqm={location.bortle_sqm}
            elevation={location.elevation}
          />

          {/* Action Buttons */}
          <LocationActions location={location} />

          {/* Community Stats */}
          <CommunityStats location={location} />

          {/* Mini Map */}
          <LocationMap location={location} compact />
        </aside>
      </div>

      {/* Sticky Bottom Actions - Mobile Only */}
      <div className="location-detail__sticky-actions">
        <LocationActions location={location} sticky />
      </div>
    </div>
  );
}

export default LocationDetailPage;
