/* LocationCard Component
 * Displays a stargazing location with rating and region info.
 * Mobile-first card design inspired by AllTrails.
 */

import { memo, useMemo, useCallback } from 'react';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { useUnits } from '../../../hooks/useUnits';
import { calculateDistance } from '../../../utils/geo';
import ImageCarousel from '../../shared/ImageCarousel';
import './styles.css';

function LocationCard({ location, userLocation, onPress, style }) {
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const { formatDistance, formatElevation } = useUnits();

  // Derive favorite status directly from location prop (cache updates are instant)
  const isSaved = location.is_favorited || false;

  // Memoize region subtitle to avoid recalculating on every render
  const region = useMemo(() => {
    const parts = [];
    if (location.administrative_area) parts.push(location.administrative_area);
    if (location.country) parts.push(location.country);
    return parts.join(', ');
  }, [location.administrative_area, location.country]);

  // Parse rating (API returns string like "4.50")
  const rating = parseFloat(location.average_rating) || 0;
  const reviewCount = location.review_count || 0;

  // Memoize distance calculation to avoid expensive recalculations
  const distance = useMemo(() => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      location.latitude,
      location.longitude
    );
  }, [userLocation, location.latitude, location.longitude]);

  // Handle favorite toggle - redirects to login if not authenticated
  const handleSave = useCallback((e) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    toggleFavorite.mutate(location.id);
  }, [requireAuth, location.id, toggleFavorite]);

  // Memoize style object for animation delay
  const cardStyle = useMemo(() => style, [style]);

  return (
    <article className="location-card glass-card glass-card--interactive" onClick={() => onPress?.(location)} style={cardStyle}>
      {/* Hero Image Carousel */}
      <div className="location-card__image-container">
        <ImageCarousel
          images={location.images || []}
          alt={location.name}
          aspectRatio="16 / 10"
        />
        <button
          className={`location-card__save ${isSaved ? 'location-card__save--active' : ''}`}
          onClick={handleSave}
          aria-label={isSaved ? 'Remove from saved' : 'Save location'}
        >
          <i className={`fa-${isSaved ? 'solid' : 'regular'} fa-heart`}></i>
        </button>

        {/* Verified badge */}
        {location.is_verified && (
          <div className="location-card__verified" title="Verified Location">
            <i className="fa-solid fa-circle-check"></i>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="location-card__content">
        <div className="location-card__header">
          <h3 className="location-card__name">{location.name}</h3>
          {region && <span className="location-card__region">{region}</span>}
        </div>

        <div className="location-card__meta">
          {/* Star Rating */}
          {reviewCount > 0 ? (
            <div className="location-card__rating">
              <i className="fa-solid fa-star"></i>
              <span>{rating.toFixed(1)}</span>
              <span className="location-card__reviews">({reviewCount})</span>
            </div>
          ) : (
            <div className="location-card__rating location-card__rating--empty">
              <i className="fa-regular fa-star"></i>
              <span>No reviews yet</span>
            </div>
          )}

          {/* Elevation */}
          {location.elevation !== null && location.elevation !== undefined && (
            <div className="location-card__elevation">
              <i className="fa-solid fa-mountain"></i>
              <span>{formatElevation(location.elevation)}</span>
            </div>
          )}

          {/* Distance from user */}
          {distance !== null && (
            <div className="location-card__distance">
              <i className="fa-solid fa-location-arrow"></i>
              <span>{formatDistance(distance)} away</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(LocationCard);
