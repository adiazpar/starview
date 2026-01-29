/**
 * usePhotoVote Hook
 *
 * React Query mutation hook for toggling photo upvotes.
 * Provides optimistic updates for instant UI feedback with rollback on error.
 * Updates both legacy location.images cache and new locationPhotos infinite query cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Helper to update a photo in an array
 */
function updatePhotoInArray(photos, photoId, updates) {
  return photos.map((photo) => {
    if (photo.id === photoId) {
      return { ...photo, ...updates };
    }
    return photo;
  });
}

/**
 * Helper to optimistically toggle vote on a photo
 */
function toggleVoteOnPhoto(photo) {
  const newHasUpvoted = !photo.user_has_upvoted;
  return {
    user_has_upvoted: newHasUpvoted,
    upvote_count: newHasUpvoted
      ? photo.upvote_count + 1
      : Math.max(0, photo.upvote_count - 1),
  };
}

/**
 * Toggle upvote on a photo
 * Uses optimistic updates for instant UI feedback with rollback on error.
 *
 * @param {number|string} locationId - Location ID for cache invalidation
 * @returns {Object} Mutation object with mutate function
 *
 * Usage:
 *   const { mutate: toggleVote, isPending } = usePhotoVote(locationId);
 *   toggleVote(photoId); // photoId format: "loc_123" or "rev_456"
 */
export function usePhotoVote(locationId) {
  const queryClient = useQueryClient();
  const locationIdStr = String(locationId);

  return useMutation({
    networkMode: 'always',
    mutationFn: async (photoId) => {
      const response = await locationsApi.voteOnPhoto(locationId, photoId);
      return response.data;
    },

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    onMutate: async (photoId) => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['location', locationIdStr] });
      await queryClient.cancelQueries({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });

      // Snapshot previous values for rollback
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);

      // Get all locationPhotos queries for this location (different sort/limit combos)
      const locationPhotosQueries = queryClient.getQueriesData({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });

      // Optimistically update the legacy location.images cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], (old) => {
          if (!old?.images) return old;

          const targetPhoto = old.images.find((img) => img.id === photoId);
          if (!targetPhoto) return old;

          const updates = toggleVoteOnPhoto(targetPhoto);
          const updatedImages = updatePhotoInArray(old.images, photoId, updates);

          // Re-sort images by upvote_count DESC, uploaded_at DESC
          updatedImages.sort((a, b) => {
            if (b.upvote_count !== a.upvote_count) {
              return b.upvote_count - a.upvote_count;
            }
            const dateA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
            const dateB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
            return dateB - dateA;
          });

          return { ...old, images: updatedImages };
        });
      }

      // Optimistically update all locationPhotos infinite queries for this location
      locationPhotosQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.pages) return old;

          const updatedPages = old.pages.map((page) => {
            const targetPhoto = page.results.find((photo) => photo.id === photoId);
            if (!targetPhoto) return page;

            const updates = toggleVoteOnPhoto(targetPhoto);
            return {
              ...page,
              results: updatePhotoInArray(page.results, photoId, updates),
            };
          });

          return { ...old, pages: updatedPages };
        });
      });

      return { previousLocation, locationPhotosQueries };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, photoId, context) => {
      // Rollback legacy location cache
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], context.previousLocation);
      }

      // Rollback all locationPhotos queries
      if (context?.locationPhotosQueries) {
        context.locationPhotosQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    // VALIDATE: Ensure cache matches server state
    onSuccess: (data) => {
      const { photo_id, upvote_count, user_has_upvoted } = data;
      const updates = { upvote_count, user_has_upvoted };

      // Update legacy location.images cache
      queryClient.setQueryData(['location', locationIdStr], (old) => {
        if (!old?.images) return old;

        const updatedImages = updatePhotoInArray(old.images, photo_id, updates);

        // Re-sort images by upvote_count DESC, uploaded_at DESC
        updatedImages.sort((a, b) => {
          if (b.upvote_count !== a.upvote_count) {
            return b.upvote_count - a.upvote_count;
          }
          const dateA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
          const dateB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
          return dateB - dateA;
        });

        return { ...old, images: updatedImages };
      });

      // Update all locationPhotos infinite queries for this location
      const locationPhotosQueries = queryClient.getQueriesData({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });

      locationPhotosQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.pages) return old;

          const updatedPages = old.pages.map((page) => ({
            ...page,
            results: updatePhotoInArray(page.results, photo_id, updates),
          }));

          return { ...old, pages: updatedPages };
        });
      });
    },
  });
}

export default usePhotoVote;
