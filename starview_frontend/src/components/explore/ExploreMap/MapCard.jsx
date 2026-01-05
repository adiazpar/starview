/* MapCard Component
 * Unified location card for map view - handles both mobile bottom card and desktop popup.
 * Variant 'bottom': slides up from bottom (mobile, or desktop in navigation mode)
 * Variant 'popup': centered on marker via ref (desktop/tablet)
 */

import { memo, useMemo, forwardRef } from 'react';
import ImageCarousel from '../../shared/ImageCarousel';
import { useUnits } from '../../../hooks/useUnits';
import { calculateDistance } from '../../../utils/geo';
import { formatDuration } from '../../../utils/navigation';

const MapCard = forwardRef(function MapCard({
  // Core data
  location,
  userLocation,

  // Variant and state
  variant = 'bottom', // 'bottom' | 'popup'
  isVisible = false,
  isSwitching = false,
  isClosing = false,

  // Navigation mode (bottom variant only)
  isNavigationMode = false,
  routeData = null,
  isRouteLoading = false,
  userLocationSource = null,

  // Handlers
  onClose,
  onNavigate,
  onToggleFavorite,
  onViewLocation,
  onCancelNavigation,
  onGo,
}, ref) {
  const { formatDistance, formatElevation, formatRouteDistance } = useUnits();

  // Derive region subtitle
  const region = useMemo(() => {
    const parts = [];
    if (location.administrative_area) parts.push(location.administrative_area);
    if (location.country) parts.push(location.country);
    return parts.join(', ');
  }, [location.administrative_area, location.country]);

  // Parse rating
  const rating = parseFloat(location.average_rating) || 0;
  const reviewCount = location.review_count || 0;

  // Calculate distance from user
  const distance = useMemo(() => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      location.latitude,
      location.longitude
    );
  }, [userLocation, location.latitude, location.longitude]);

  // Build class names based on variant and state
  const className = useMemo(() => {
    if (variant === 'popup') {
      return `map-card map-card--popup ${isClosing ? 'map-card--closing' : ''}`;
    }
    return `map-card map-card--bottom ${isVisible ? 'map-card--visible' : ''} ${isSwitching ? 'map-card--switching' : ''} ${isNavigationMode ? 'map-card--navigation' : ''}`;
  }, [variant, isVisible, isSwitching, isClosing, isNavigationMode]);

  // Image aspect ratio differs by variant
  const imageAspectRatio = variant === 'popup' ? '16 / 10' : '16 / 7';

  return (
    <div
      ref={ref}
      className={className}
      onClick={isNavigationMode ? undefined : onViewLocation}
    >
      {/* Image Section */}
      <div className="map-card__image-container">
        <div className="map-card__image-inner">
          <ImageCarousel
            images={location.images || []}
            alt={location.name}
            aspectRatio={imageAspectRatio}
          />

          {/* Close Button */}
          <button
            className="map-card__btn map-card__btn--close"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>

          {/* Favorite Button */}
          <button
            className={`map-card__btn map-card__btn--favorite ${location.is_favorited ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(e);
            }}
            aria-label={location.is_favorited ? 'Remove from saved' : 'Save location'}
          >
            <i className={`fa-${location.is_favorited ? 'solid' : 'regular'} fa-heart`}></i>
          </button>

          {/* Action Buttons - top left */}
          <div className="map-card__actions">
            {/* Navigate Button */}
            <button
              className="map-card__btn"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.(e);
              }}
              aria-label="Get directions"
            >
              <i className="fa-solid fa-diamond-turn-right"></i>
            </button>

            {/* Observatory-specific buttons */}
            {location.location_type === 'observatory' && location.type_metadata?.phone_number && (
              <a
                href={`tel:${location.type_metadata.phone_number}`}
                className="map-card__btn"
                onClick={(e) => e.stopPropagation()}
                aria-label="Call observatory"
              >
                <i className="fa-solid fa-phone"></i>
              </a>
            )}
            {location.location_type === 'observatory' && location.type_metadata?.website && (
              <a
                href={location.type_metadata.website}
                className="map-card__btn"
                onClick={(e) => e.stopPropagation()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit website"
              >
                <i className="fa-solid fa-globe"></i>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="map-card__content">
        {/* Header row */}
        <div className={`map-card__header-row ${isNavigationMode ? 'map-card__header-row--navigation' : ''}`}>
          <div className="map-card__header">
            <h3 className="map-card__name">{location.name}</h3>
            {region && <span className="map-card__region">{region}</span>}
          </div>

          {/* Route stats - inline in navigation mode (bottom variant only) */}
          {variant === 'bottom' && isNavigationMode && (
            <div className={`map-card__route-stats ${userLocationSource !== 'browser' ? 'map-card__route-stats--hint' : ''}`}>
              {userLocationSource === 'browser' ? (
                isRouteLoading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Calculating...</span>
                  </>
                ) : routeData?.noRouteFound ? (
                  <div className="map-card__route-unavailable">
                    <i className="fa-solid fa-car"></i>
                    <span>No driving route</span>
                  </div>
                ) : routeData ? (
                  <>
                    <div className="map-card__route-duration">
                      <i className="fa-solid fa-clock"></i>
                      <span>{formatDuration(routeData.duration)}</span>
                    </div>
                    <div className="map-card__route-distance">
                      <i className="fa-solid fa-road"></i>
                      <span>{formatRouteDistance(routeData.distance)}</span>
                      {routeData.isEstimated && (
                        <span className="map-card__route-estimated">(est.)</span>
                      )}
                    </div>
                  </>
                ) : null
              ) : (
                <>
                  <i className="fa-solid fa-location-crosshairs"></i>
                  <span>Enable location</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Metadata - collapses in navigation mode */}
        <div className={`map-card__meta-container ${isNavigationMode ? 'map-card__meta-container--hidden' : ''}`}>
          <div className="map-card__meta">
            {/* Rating */}
            {reviewCount > 0 ? (
              <div className="map-card__rating">
                <i className="fa-solid fa-star"></i>
                <span>{rating.toFixed(1)}</span>
                <span className="map-card__reviews">({reviewCount})</span>
              </div>
            ) : (
              <div className="map-card__rating map-card__rating--empty">
                <i className="fa-regular fa-star"></i>
                <span>No reviews yet</span>
              </div>
            )}

            {/* Elevation */}
            {location.elevation !== null && location.elevation !== undefined && (
              <div className="map-card__elevation">
                <i className="fa-solid fa-mountain"></i>
                <span>{formatElevation(location.elevation)}</span>
              </div>
            )}

            {/* Distance */}
            {distance !== null && (
              <div className="map-card__distance">
                <i className="fa-solid fa-location-arrow"></i>
                <span>{formatDistance(distance)} away</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation mode section (bottom variant only) */}
        {variant === 'bottom' && isNavigationMode && (
          <div className="map-card__route">
            {/* FROM section */}
            <div className="map-card__route-from">
              <span className="map-card__route-label">FROM</span>
              <span className={`map-card__route-value ${userLocationSource !== 'browser' ? 'map-card__route-value--warning' : ''}`}>
                {userLocationSource === 'browser' ? 'Your location' : 'Location unavailable'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="map-card__route-actions">
              <button
                className="btn-danger btn-danger--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelNavigation?.();
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary btn-primary--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onGo?.(e);
                }}
              >
                GO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default memo(MapCard);
