/* LocationActions Component
 * Action buttons for favorite, mark visited, and share.
 * Supports both sidebar (desktop) and sticky bar (mobile) layouts.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useToggleFavorite } from '../../../hooks/useLocations';
import { locationsApi } from '../../../services/locations';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

function LocationActions({ location, sticky = false }) {
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [isVisited, setIsVisited] = useState(false); // TODO: Get from API when available

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

  // Handle favorite toggle
  const handleFavorite = useCallback(() => {
    if (!requireAuth()) return;
    toggleFavorite.mutate(location.id);
  }, [requireAuth, location.id, toggleFavorite]);

  // Handle mark visited
  const handleMarkVisited = useCallback(() => {
    if (!requireAuth()) return;
    if (isVisited) {
      unmarkVisitedMutation.mutate();
    } else {
      markVisitedMutation.mutate();
    }
  }, [requireAuth, isVisited, markVisitedMutation, unmarkVisitedMutation]);

  // Handle share
  const handleShare = useCallback(async () => {
    const shareData = {
      title: location.name,
      text: `Check out ${location.name} on Starview - a great stargazing spot!`,
      url: window.location.href,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
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
  const isMarkingVisited = markVisitedMutation.isPending || unmarkVisitedMutation.isPending;

  // Sticky bar layout (mobile)
  if (sticky) {
    return (
      <div className="location-actions location-actions--sticky">
        <button
          className={`location-actions__btn ${isFavorited ? 'location-actions__btn--active' : ''}`}
          onClick={handleFavorite}
          disabled={toggleFavorite.isPending}
        >
          <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
          <span>{isFavorited ? 'Saved' : 'Save'}</span>
        </button>

        <button
          className={`location-actions__btn location-actions__btn--primary ${isVisited ? 'location-actions__btn--active' : ''}`}
          onClick={handleMarkVisited}
          disabled={isMarkingVisited}
        >
          {isMarkingVisited ? (
            <i className="fa-solid fa-spinner fa-spin"></i>
          ) : (
            <i className={`fa-${isVisited ? 'solid' : 'regular'} fa-circle-check`}></i>
          )}
          <span>{isVisited ? 'Visited' : 'Mark Visited'}</span>
        </button>
      </div>
    );
  }

  // Sidebar layout (desktop)
  return (
    <div className="location-actions glass-card">
      <button
        className={`location-actions__sidebar-btn ${isFavorited ? 'location-actions__sidebar-btn--active' : ''}`}
        onClick={handleFavorite}
        disabled={toggleFavorite.isPending}
      >
        <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
        <span>{isFavorited ? 'Saved to Favorites' : 'Add to Favorites'}</span>
      </button>

      <button
        className={`location-actions__sidebar-btn location-actions__sidebar-btn--primary ${isVisited ? 'location-actions__sidebar-btn--visited' : ''}`}
        onClick={handleMarkVisited}
        disabled={isMarkingVisited}
      >
        {isMarkingVisited ? (
          <i className="fa-solid fa-spinner fa-spin"></i>
        ) : (
          <i className={`fa-${isVisited ? 'solid' : 'regular'} fa-circle-check`}></i>
        )}
        <span>{isVisited ? 'Visited' : 'Mark as Visited'}</span>
      </button>

      <button
        className="location-actions__sidebar-btn"
        onClick={handleShare}
      >
        <i className="fa-solid fa-share-nodes"></i>
        <span>Share Location</span>
      </button>
    </div>
  );
}

export default LocationActions;
