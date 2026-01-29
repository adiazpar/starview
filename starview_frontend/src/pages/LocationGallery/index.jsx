/* LocationGallery Page
 * Displays all photos for a location with a simplified hero-style header.
 * Header adapted from LocationHero without image carousel or action buttons.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { useLocation } from '../../hooks/useLocations';
import { useSEO } from '../../hooks/useSEO';
import './styles.css';

function LocationGalleryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, isLoading, isError, error } = useLocation(id);

  // Set SEO meta tags
  useSEO({
    title: location ? `Photos of ${location.name} | Starview` : 'Photos | Starview',
    description: location
      ? `Browse photos of ${location.name} in ${location.administrative_area || location.country || 'unknown location'}.`
      : 'Browse photos of this stargazing location on Starview.',
    path: `/locations/${id}/photos`,
  });

  // Handle back navigation
  const handleBack = useCallback(() => {
    // Go back in history, or fallback to location detail if no history
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(`/locations/${id}`);
    }
  }, [navigate, id]);

  // Build region string
  const region = location
    ? [location.locality, location.administrative_area, location.country]
        .filter(Boolean)
        .join(', ')
    : '';

  // Loading state
  if (isLoading) {
    return <div className="location-gallery location-gallery--loading" />;
  }

  // Error state
  if (isError) {
    return (
      <div className="location-gallery location-gallery--error">
        <div className="location-gallery__error-content glass-card">
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
    <div className="location-gallery">
      {/* Header Section */}
      <header className="location-gallery__header">
        {/* Navigation Bar */}
        <nav className="location-gallery__nav">
          <button
            className="location-gallery__back"
            onClick={handleBack}
            aria-label="Go back to location"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span className="location-gallery__back-text">Back</span>
          </button>
        </nav>

        {/* Location Info */}
        <div className="location-gallery__info">
          <h1 className="location-gallery__title">Photos of {location.name}</h1>

          {region && (
            <p className="location-gallery__region">{region}</p>
          )}

          {/* Rating */}
          <div className="location-gallery__stats">
            {location.average_rating > 0 ? (
              <span className="location-gallery__stat">
                <i className="fa-solid fa-star"></i>
                {parseFloat(location.average_rating).toFixed(1)}
                <span className="location-gallery__stat-label">
                  ({location.review_count} {location.review_count === 1 ? 'review' : 'reviews'})
                </span>
              </span>
            ) : (
              <span className="location-gallery__stat location-gallery__stat--muted">
                <i className="fa-regular fa-star"></i>
                <span className="location-gallery__stat-label">No reviews yet</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="location-gallery__toolbar">
        <button className="location-gallery__upload">
          Upload Photo
        </button>
        <button className="location-gallery__sort" aria-haspopup="listbox">
          <i className="fa-solid fa-sort"></i>
          <span>Newest</span>
          <i className="fa-solid fa-chevron-down"></i>
        </button>
      </div>

      {/* Content Area */}
      <div className="location-gallery__content">
        <div className="location-gallery__empty">
          <i className="fa-regular fa-image"></i>
          <h3>No photos yet</h3>
          <p>Be the first to share a photo of {location.name}</p>
        </div>
      </div>

      {/* Footer with pagination info */}
      <footer className="location-gallery__footer">
        <span>Showing results 0 - 0 of 0</span>
      </footer>
    </div>
  );
}

export default LocationGalleryPage;
