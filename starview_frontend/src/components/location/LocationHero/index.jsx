/* LocationHero Component
 * Full-bleed hero image with gradient overlay and location title.
 * Includes back navigation and share/save/visited actions.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import { useUnits } from '../../../hooks/useUnits';
import './styles.css';

// Placeholder for locations without photos
const PLACEHOLDER_IMAGE = '/images/default_location.jpg';

function LocationHero({ location, onBack }) {
  const navigate = useNavigate();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const { showToast } = useToast();
  const { formatElevation } = useUnits();
  const queryClient = useQueryClient();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVisited, setIsVisited] = useState(false);

  // Mark visited mutation
  const markVisitedMutation = useMutation({
    mutationFn: () => locationsApi.markVisited(location.id),
    onSuccess: (response) => {
      setIsVisited(true);
      showToast('Location marked as visited!', 'success');

      // Check for newly earned badges
      if (response.data.newly_earned_badges?.length > 0) {
        const badges = response.data.newly_earned_badges;
        badges.forEach((badge) => {
          showToast(`Badge earned: ${badge.name}!`, 'success');
        });
      }

      // Invalidate location query to refresh data
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      showToast('Failed to mark as visited', 'error');
    },
  });

  // Unmark visited mutation
  const unmarkVisitedMutation = useMutation({
    mutationFn: () => locationsApi.unmarkVisited(location.id),
    onSuccess: () => {
      setIsVisited(false);
      showToast('Visit removed', 'info');
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      showToast('Failed to remove visit', 'error');
    },
  });

  // Get hero image (first image or placeholder)
  const heroImage = location.images?.[0]?.full || location.images?.[0]?.thumbnail || PLACEHOLDER_IMAGE;

  // Build region string
  const region = [location.locality, location.administrative_area, location.country]
    .filter(Boolean)
    .join(', ');

  // Handle favorite toggle
  const handleFavorite = useCallback((e) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    toggleFavorite.mutate(location.id);
  }, [requireAuth, location.id, toggleFavorite]);

  // Handle mark visited
  const handleMarkVisited = useCallback((e) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    if (isVisited) {
      unmarkVisitedMutation.mutate();
    } else {
      markVisitedMutation.mutate();
    }
  }, [requireAuth, isVisited, markVisitedMutation, unmarkVisitedMutation]);

  const isMarkingVisited = markVisitedMutation.isPending || unmarkVisitedMutation.isPending;

  // Handle share
  const handleShare = useCallback(async (e) => {
    e.stopPropagation();
    const shareData = {
      title: location.name,
      text: `Check out ${location.name} on Starview - a great stargazing spot!`,
      url: window.location.href,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Copy to clipboard as fallback
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast('Link copied to clipboard', 'success');
        } catch {
          showToast('Failed to share', 'error');
        }
      }
    }
  }, [location.name, showToast]);

  const isFavorited = location.is_favorited || false;

  return (
    <header className="location-hero">
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
            onClick={handleFavorite}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
            <span className="location-hero__action-text">
              {isFavorited ? 'Saved' : 'Save'}
            </span>
          </button>
          <button
            className={`location-hero__action ${isVisited ? 'location-hero__action--visited' : ''}`}
            onClick={handleMarkVisited}
            disabled={isMarkingVisited}
            aria-label={isVisited ? 'Remove visit' : 'Mark as visited'}
          >
            {isMarkingVisited ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-map-pin"></i>
            )}
            <span className="location-hero__action-text">
              {isVisited ? 'Visited' : 'Visited'}
            </span>
          </button>
          <button
            className="location-hero__action"
            onClick={handleShare}
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
}

export default LocationHero;
