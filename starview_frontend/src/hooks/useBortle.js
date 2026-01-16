/**
 * useBortle Hook
 *
 * React Query hook for fetching Bortle scale (light pollution) data.
 * Bortle class ranges from 1 (excellent dark sky) to 9 (inner city).
 */

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import bortleApi from '../services/bortle';

/**
 * Fetch Bortle class for a location
 * @param {Object} options - Hook options
 * @param {number} options.lat - Latitude
 * @param {number} options.lng - Longitude
 * @param {boolean} options.enabled - Enable/disable the query
 * @param {boolean} options.suspense - Use Suspense mode
 * @returns {Object} Query result with Bortle data
 */
export function useBortle({ lat, lng, enabled = true, suspense = false } = {}) {
  const hasCoords = lat !== undefined && lng !== undefined;

  // Round coordinates for consistent cache keys
  const roundedLat = lat !== undefined ? Math.round(lat * 100) / 100 : undefined;
  const roundedLng = lng !== undefined ? Math.round(lng * 100) / 100 : undefined;

  const queryConfig = {
    queryKey: ['bortle', roundedLat, roundedLng],
    queryFn: () => bortleApi.getBortle({ lat, lng }),
    staleTime: 0, // Never use stale data
    gcTime: 0, // Don't cache - backend handles caching (30 day TTL)
    refetchOnMount: 'always',
    retry: 2,
  };

  const query = suspense
    ? useSuspenseQuery(queryConfig)
    : useQuery({ ...queryConfig, enabled: enabled && hasCoords });

  return {
    bortle: query.data?.bortle ?? null,
    sqm: query.data?.sqm ?? null,
    description: query.data?.description || null,
    quality: query.data?.quality || null,
    location: query.data?.location || null,
    isLoading: query.isLoading ?? false,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useBortle;
