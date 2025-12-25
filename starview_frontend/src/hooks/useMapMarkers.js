/**
 * useMapMarkers Hook
 *
 * Fetches lightweight location data optimized for map markers.
 * Uses React Query for caching (matches backend 30min cache).
 */

import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Fetch map markers for all locations
 * @returns {Object} Query result with markers array
 */
export function useMapMarkers() {
  const query = useQuery({
    queryKey: ['mapMarkers'],
    queryFn: async () => {
      const response = await locationsApi.getMapMarkers();
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes (matches backend cache)
  });

  return {
    markers: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useMapMarkers;
