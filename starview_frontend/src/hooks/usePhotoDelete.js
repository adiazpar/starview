/**
 * usePhotoDelete Hook
 *
 * React Query mutation hook for deleting photos.
 * Provides optimistic updates for instant UI feedback with rollback on error.
 * Updates location.images in all caches: single location, list queries, and locationPhotos.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Helper to remove a photo from an array by ID
 */
function removePhotoFromArray(photos, photoId) {
  return photos.filter((photo) => photo.id !== photoId);
}

/**
 * Helper to update a location's images in a list of locations
 */
function updateLocationImagesInList(locations, locationId, photoId) {
  if (!locations) return locations;
  return locations.map((loc) => {
    if (String(loc.id) === String(locationId) && loc.images) {
      return { ...loc, images: removePhotoFromArray(loc.images, photoId) };
    }
    return loc;
  });
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
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      await queryClient.cancelQueries({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });

      // Snapshot previous values for rollback
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['locations', 'infinite'] });
      const previousPaginated = queryClient.getQueriesData({ queryKey: ['locations', 'paginated'] });
      const previousPopularNearby = queryClient.getQueriesData({ queryKey: ['locations', 'popularNearby'] });
      const locationPhotosQueries = queryClient.getQueriesData({
        queryKey: ['locationPhotos', locationIdStr],
        exact: false,
      });

      // Optimistically remove from the single location cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], (old) => {
          if (!old?.images) return old;
          return { ...old, images: removePhotoFromArray(old.images, photoId) };
        });
      }

      // Optimistically remove from infinite list queries (explore page)
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: updateLocationImagesInList(page.results, locationIdStr, photoId),
          })),
        };
      });

      // Optimistically remove from paginated list queries
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (old) => {
        if (!old?.results) return old;
        return {
          ...old,
          results: updateLocationImagesInList(old.results, locationIdStr, photoId),
        };
      });

      // Optimistically remove from popular nearby queries (home page)
      queryClient.setQueriesData({ queryKey: ['locations', 'popularNearby'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return updateLocationImagesInList(old, locationIdStr, photoId);
      });

      // Optimistically remove from all locationPhotos infinite queries for this location
      locationPhotosQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              results: removePhotoFromArray(page.results, photoId),
              total_count: Math.max(0, (page.total_count || 0) - 1),
            })),
          };
        });
      });

      return {
        previousLocation,
        previousInfinite,
        previousPaginated,
        previousPopularNearby,
        locationPhotosQueries,
        photoId,
      };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, photoId, context) => {
      // Rollback single location cache
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], context.previousLocation);
      }

      // Rollback infinite list queries
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      // Rollback paginated list queries
      if (context?.previousPaginated) {
        context.previousPaginated.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      // Rollback popular nearby queries
      if (context?.previousPopularNearby) {
        context.previousPopularNearby.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
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
      // Also invalidate list queries to get fresh data
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export default usePhotoDelete;
