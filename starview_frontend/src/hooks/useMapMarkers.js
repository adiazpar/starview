/**
 * useMapMarkers Hook
 *
 * Fetches lightweight location data optimized for map markers.
 * Uses React Query for caching (matches backend 30min cache).
 * Provides O(1) marker lookup via markerMap.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Fetch map markers for all locations
 * @returns {Object} Query result with markers array and lookup map
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

  const markers = query.data || [];

  // O(1) lookup map for marker by ID (avoids .find() on every click)
  const markerMap = useMemo(() => {
    return new Map(markers.map(m => [m.id, m]));
  }, [markers]);

  return {
    markers,
    markerMap, // Use markerMap.get(id) instead of markers.find(m => m.id === id)
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useMapMarkers;
