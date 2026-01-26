/**
 * usePhotoVote Hook
 *
 * React Query mutation hook for toggling photo upvotes.
 * Provides optimistic updates for instant UI feedback with rollback on error.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

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

      // Snapshot previous value for rollback
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);

      // Optimistically update the location's images
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], (old) => {
          if (!old?.images) return old;

          const updatedImages = old.images.map((img) => {
            if (img.id === photoId) {
              const newHasUpvoted = !img.user_has_upvoted;
              return {
                ...img,
                user_has_upvoted: newHasUpvoted,
                upvote_count: newHasUpvoted
                  ? img.upvote_count + 1
                  : Math.max(0, img.upvote_count - 1),
              };
            }
            return img;
          });

          // Re-sort images by upvote_count DESC, uploaded_at DESC
          updatedImages.sort((a, b) => {
            if (b.upvote_count !== a.upvote_count) {
              return b.upvote_count - a.upvote_count;
            }
            // Secondary sort by uploaded_at (most recent first)
            const dateA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
            const dateB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
            return dateB - dateA;
          });

          return { ...old, images: updatedImages };
        });
      }

      return { previousLocation };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, photoId, context) => {
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], context.previousLocation);
      }
    },

    // VALIDATE: Ensure cache matches server state
    onSuccess: (data) => {
      const { photo_id, upvote_count, user_has_upvoted } = data;

      queryClient.setQueryData(['location', locationIdStr], (old) => {
        if (!old?.images) return old;

        const updatedImages = old.images.map((img) => {
          if (img.id === photo_id) {
            return { ...img, upvote_count, user_has_upvoted };
          }
          return img;
        });

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
    },
  });
}

export default usePhotoVote;
