/**
 * useProfileData Hook
 *
 * React Query hook for fetching private profile data.
 * Provides caching, automatic deduplication, and loading/error states.
 * Fetches badge collection and social accounts in parallel.
 * Also provides badge pinning functionality.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { profileApi } from '../services/profile';
import { mapBadgeIdsToBadges } from '../utils/badges';

// Query keys for cache management
export const profileQueryKeys = {
  badgeCollection: ['profile', 'badges', 'collection'],
  socialAccounts: ['profile', 'socialAccounts'],
};

/**
 * Fetch badge collection data
 */
function useBadgeCollection() {
  return useQuery({
    queryKey: profileQueryKeys.badgeCollection,
    queryFn: async () => {
      const response = await profileApi.getMyBadgeCollection();
      return response.data;
    },
  });
}

/**
 * Fetch social accounts data
 */
function useSocialAccounts() {
  return useQuery({
    queryKey: profileQueryKeys.socialAccounts,
    queryFn: async () => {
      const response = await profileApi.getSocialAccounts();
      return response.data.social_accounts || [];
    },
  });
}

/**
 * Combined hook for all profile data
 * @returns {Object} Profile data and query states
 */
export function useProfileData() {
  const queryClient = useQueryClient();

  const badgeQuery = useBadgeCollection();
  const socialQuery = useSocialAccounts();

  // Pin operation state
  const [isPinning, setIsPinning] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Compute loading state (both queries must complete)
  const isLoading = badgeQuery.isLoading || socialQuery.isLoading;
  const isError = badgeQuery.isError || socialQuery.isError;
  const error = badgeQuery.error || socialQuery.error;

  // Extract pinned badge IDs from badge data
  const pinnedBadgeIds = useMemo(() => {
    return badgeQuery.data?.pinned_badge_ids || [];
  }, [badgeQuery.data]);

  // Compute pinned badges from badge data
  const pinnedBadges = useMemo(() => {
    if (!badgeQuery.data || !pinnedBadgeIds.length) return [];
    const earnedBadges = badgeQuery.data.earned || [];
    return mapBadgeIdsToBadges(pinnedBadgeIds, earnedBadges);
  }, [badgeQuery.data, pinnedBadgeIds]);

  // Function to refresh social accounts (after connect/disconnect)
  const refreshSocialAccounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.socialAccounts });
  }, [queryClient]);

  // Function to refresh badge data (after pin/unpin)
  const refreshBadges = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.badgeCollection });
  }, [queryClient]);

  // Function to update pinned badge IDs in cache (optimistic update)
  const updatePinnedBadgeIds = useCallback((newPinnedIds) => {
    queryClient.setQueryData(profileQueryKeys.badgeCollection, (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pinned_badge_ids: newPinnedIds,
      };
    });
  }, [queryClient]);

  // Clear pin messages
  const clearMessages = useCallback(() => {
    setPinError('');
    setPinSuccess('');
  }, []);

  // Toggle pin status for a badge
  const togglePin = useCallback(async (badgeId) => {
    // Clear previous messages
    setPinError('');
    setPinSuccess('');

    const currentlyPinned = pinnedBadgeIds.includes(badgeId);

    // If trying to pin a new badge, check the 3-badge limit
    if (!currentlyPinned && pinnedBadgeIds.length >= 3) {
      setPinError('You can only pin up to 3 badges. Unpin one first to pin another.');
      return false;
    }

    setIsPinning(true);

    try {
      // Calculate new pinned array
      const newPinnedIds = currentlyPinned
        ? pinnedBadgeIds.filter(id => id !== badgeId) // Unpin
        : [...pinnedBadgeIds, badgeId]; // Pin

      // Call API to update pinned badges
      const response = await profileApi.updatePinnedBadges({
        pinned_badge_ids: newPinnedIds
      });

      // Update cache with response from backend
      updatePinnedBadgeIds(response.data.pinned_badge_ids);

      // Set success message
      if (currentlyPinned) {
        setPinSuccess('Badge unpinned successfully!');
      } else {
        setPinSuccess('Badge pinned successfully!');
      }

      return true;
    } catch (err) {
      console.error('Error toggling pin:', err);
      const errorMsg = err.response?.data?.detail
        || err.response?.data?.message
        || 'Failed to update pinned badges. Please try again.';
      setPinError(errorMsg);
      return false;
    } finally {
      setIsPinning(false);
    }
  }, [pinnedBadgeIds, updatePinnedBadgeIds]);

  return {
    // Badge data
    badgeData: badgeQuery.data,
    pinnedBadgeIds,
    pinnedBadges,

    // Social accounts data
    socialAccounts: socialQuery.data || [],

    // Loading/error states
    isLoading,
    isError,
    error,

    // Refetch functions
    refreshSocialAccounts,
    refreshBadges,
    updatePinnedBadgeIds,

    // Pin operations (for BadgesTab compatibility)
    pinnedBadgesHook: {
      pinnedBadgeIds,
      togglePin,
      isLoading: isPinning,
      error: pinError,
      successMessage: pinSuccess,
      clearMessages,
    },
  };
}

export default useProfileData;
