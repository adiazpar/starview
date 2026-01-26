/* LocationHero Component
 * Full-bleed hero image with gradient overlay and location title.
 * Includes back navigation and share/save/visited actions.
 *
 * Props:
 * - location: Location object with all details
 * - onBack: Callback for back button
 * - ref: Ref to attach to the hero element for scroll detection
 * - isFavorited: Whether location is favorited
 * - isVisited: Whether location is marked as visited
 * - onFavorite: Callback for favorite toggle
 * - onMarkVisited: Callback for mark visited toggle
 * - onShare: Callback for share action
 */

import { useState, forwardRef } from 'react';
import { useUnits } from '../../../hooks/useUnits';
import './styles.css';

// Placeholder for locations without photos
const PLACEHOLDER_IMAGE = '/images/default_location.jpg';

const LocationHero = forwardRef(function LocationHero({
  location,
  onBack,
  isFavorited,
  isVisited,
  onFavorite,
  onMarkVisited,
  onShare,
}, ref) {
  const { formatElevation } = useUnits();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Get hero image (first image or placeholder)
  const heroImage = location.images?.[0]?.full || location.images?.[0]?.thumbnail || PLACEHOLDER_IMAGE;

  // Build region string
  const region = [location.locality, location.administrative_area, location.country]
    .filter(Boolean)
    .join(', ');

  return (
    <header ref={ref} className="location-hero">
      {/* Hero Image */}
      <div className="location-hero__image-container">
        <img
          src={imageError ? PLACEHOLDER_IMAGE : heroImage}
          alt={location.name}
          className={`location-hero__image ${imageLoaded ? 'location-hero__image--loaded' : ''}`}
          onLoad={() => setTimeout(() => setImageLoaded(true), 50)}
          onError={() => setImageError(true)}
        />
        <div className="location-hero__gradient" />
      </div>

      {/* Top Navigation Bar */}
      <nav className="location-hero__nav">
        <button
          className="location-hero__back"
          onClick={onBack}
          aria-label="Go back"
        >
          <i className="fa-solid fa-arrow-left"></i>
          <span className="location-hero__back-text">Back</span>
        </button>

        <div className="location-hero__actions">
          <button
            className={`location-hero__action ${isFavorited ? 'location-hero__action--active' : ''}`}
            onClick={onFavorite}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
            <span className="location-hero__action-text">
              {isFavorited ? 'Saved' : 'Save'}
            </span>
          </button>
          <button
            className={`location-hero__action ${isVisited ? 'location-hero__action--visited' : ''}`}
            onClick={onMarkVisited}
            aria-label={isVisited ? 'Remove visit' : 'Mark as visited'}
          >
            <i className={`fa-${isVisited ? 'solid' : 'regular'} fa-flag`}></i>
            <span className="location-hero__action-text">
              {isVisited ? 'Visited' : 'Visit'}
            </span>
          </button>
          <button
            className="location-hero__action"
            onClick={onShare}
            aria-label="Share location"
          >
            <i className="fa-solid fa-share"></i>
            <span className="location-hero__action-text">Share</span>
          </button>
        </div>
      </nav>

      {/* Photo Count Indicator */}
      {location.images?.length > 1 && (
        <button
          className="location-hero__photo-count"
          onClick={() => {
            document.getElementById('photo-gallery')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }}
          aria-label={`View all ${location.images.length} photos`}
        >
          <i className="fa-solid fa-images"></i>
          View {location.images.length} photos
        </button>
      )}

      {/* Location Info Overlay */}
      <div className="location-hero__info">
        {location.is_verified && (
          <div className="location-hero__badges">
            <span className="location-hero__badge location-hero__badge--verified">
              <i className="fa-solid fa-circle-check"></i>
              Verified
            </span>
          </div>
        )}

        <h1 className="location-hero__title">{location.name}</h1>

        {region && (
          <p className="location-hero__region">{region}</p>
        )}

        {/* Stats Row */}
        <div className="location-hero__stats">
          {location.average_rating > 0 ? (
            <span className="location-hero__stat">
              <i className="fa-solid fa-star"></i>
              {parseFloat(location.average_rating).toFixed(1)}
              <span className="location-hero__stat-label">
                ({location.review_count} {location.review_count === 1 ? 'review' : 'reviews'})
              </span>
            </span>
          ) : (
            <span className="location-hero__stat location-hero__stat--muted">
              <i className="fa-regular fa-star"></i>
              <span className="location-hero__stat-label">No reviews yet</span>
            </span>
          )}

          {location.bortle_class && (
            <>
              <span className="location-hero__stat-divider">•</span>
              <span className="location-hero__stat">
                B{location.bortle_class}
                <span className="location-hero__stat-label">Bortle</span>
              </span>
            </>
          )}

          {location.elevation && (
            <>
              <span className="location-hero__stat-divider">•</span>
              <span className="location-hero__stat">
                {formatElevation(location.elevation)}
                <span className="location-hero__stat-label">elevation</span>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
});

export default LocationHero;
