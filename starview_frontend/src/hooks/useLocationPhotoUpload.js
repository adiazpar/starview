/**
 * useLocationPhotoUpload Hook
 *
 * React Query mutation hook for uploading photos to a location's gallery.
 * Invalidates the locationPhotos query on success to refetch fresh data.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Upload photos to a location's gallery
 *
 * @param {number|string} locationId - Location ID for cache invalidation
 * @returns {Object} Mutation object with mutate function, isPending, error, etc.
 *
 * Usage:
 *   const { mutate: uploadPhotos, isPending, error, reset } = useLocationPhotoUpload(locationId);
 *   uploadPhotos(files); // files is an array of File objects
 *   reset(); // clears error state
 */
export function useLocationPhotoUpload(locationId) {
  const queryClient = useQueryClient();
  const locationIdStr = String(locationId);

  return useMutation({
    mutationFn: async (files) => {
      const response = await locationsApi.addPhotosToLocation(locationId, files);
      return response.data;
    },

    onSuccess: () => {
      // Invalidate the locationPhotos query to refetch with new photos
      queryClient.invalidateQueries({
        queryKey: ['locationPhotos', locationIdStr],
      });

      // Also invalidate the location query to update image count
      queryClient.invalidateQueries({
        queryKey: ['location', locationIdStr],
      });
    },
  });
}

export default useLocationPhotoUpload;
