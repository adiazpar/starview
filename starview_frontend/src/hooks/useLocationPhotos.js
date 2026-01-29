/**
 * useLocationPhotos Hook
 *
 * React Query hook for fetching location photos with cursor-based pagination.
 * Supports infinite scroll with "See More" button pattern.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Fetch photos for a location with infinite scroll support
 * @param {number|string} locationId - Location ID
 * @param {string} sort - Sort order: "newest", "oldest", "most_upvoted"
 * @param {number} limit - Number of photos per page (default: 24, max: 50)
 * @param {Object} options - Additional React Query options
 * @returns {Object} Query result with photos data and pagination controls
 */
export function useLocationPhotos(locationId, sort = 'newest', limit = 24, options = {}) {
  const query = useInfiniteQuery({
    queryKey: ['locationPhotos', locationId, sort, limit],
    queryFn: async ({ pageParam = null }) => {
      const response = await locationsApi.getPhotos(locationId, {
        sort,
        cursor: pageParam,
        limit,
      });
      return response.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    initialPageParam: null,
    enabled: !!locationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });

  // Flatten pages into a single array of photos
  const photos = query.data?.pages.flatMap((page) => page.results) || [];
  const totalCount = query.data?.pages[0]?.total_count || 0;

  return {
    photos,
    totalCount,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export default useLocationPhotos;
