/**
 * usePhotoDelete Hook
 *
 * React Query mutation hook for deleting photos.
 * Provides optimistic updates for instant UI feedback with rollback on error.
 * Updates both legacy location.images cache and new locationPhotos infinite query cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Helper to remove a photo from an array
 */
function removePhotoFromArray(photos, photoId) {
  return photos.filter((photo) => photo.id !== photoId);
}

/**
 * Delete a photo from a location
 * Uses optimistic updates for instant UI feedback with rollback on error.
 *
 * @param {number|string} locationId - Location ID for cache invalidation
 * @returns {Object} Mutation object with mutate function
 *
 * Usage:
 *   const { mutate: deletePhoto, isPending } = usePhotoDelete(locationId);
 *   deletePhoto(photoId, { onSuccess: () => closeLightbox() });
 */
export function usePhotoDelete(locationId) {
  const queryClient = useQueryClient();
  const locationIdStr = String(locationId);

  return useMutation({
    networkMode: 'always',
    mutationFn: async (photoId) => {
      const response = await locationsApi.deletePhoto(locationId, photoId);
      return { ...response.data, photo_id: photoId };
    },

    // OPTIMISTIC UPDATE: Remove photo from UI immediately before API call
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

      // Optimistically remove from the legacy location.images cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], (old) => {
          if (!old?.images) return old;
          return { ...old, images: removePhotoFromArray(old.images, photoId) };
        });
      }

      // Optimistically remove from all locationPhotos infinite queries for this location
      locationPhotosQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.pages) return old;

          const updatedPages = old.pages.map((page) => ({
            ...page,
            results: removePhotoFromArray(page.results, photoId),
            total_count: Math.max(0, (page.total_count || 0) - 1),
          }));

          return { ...old, pages: updatedPages };
        });
      });

      return { previousLocation, locationPhotosQueries, photoId };
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

    // SUCCESS: Invalidate queries to ensure data is fresh
    onSettled: () => {
      // Invalidate to refetch and ensure server state is reflected
      queryClient.invalidateQueries({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: ['location', locationIdStr] });
    },
  });
}

export default usePhotoDelete;
