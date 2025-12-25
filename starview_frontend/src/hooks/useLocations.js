/**
 * useLocations Hook
 *
 * React Query hooks for fetching and mutating locations.
 * Provides caching, automatic refetching, and loading/error states.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Fetch and cache locations list with infinite scroll support
 * @param {Object} params - Query parameters (search, filters, etc.)
 * @returns {Object} Query result with locations data and pagination controls
 */
export function useLocations(params = {}) {
  const query = useInfiniteQuery({
    queryKey: ['locations', params],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await locationsApi.getAll({ ...params, page: pageParam });
      return response.data;
    },
    getNextPageParam: (lastPage) => {
      // Extract page number from next URL, or return undefined if no more pages
      if (!lastPage.next) return undefined;
      const url = new URL(lastPage.next);
      return url.searchParams.get('page');
    },
    initialPageParam: 1,
  });

  // Flatten all pages into a single array of locations
  const locations = query.data?.pages.flatMap((page) => page.results) || [];

  return {
    locations,
    count: query.data?.pages[0]?.count || 0,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single location by ID
 * @param {number} id - Location ID
 * @returns {Object} Query result with location data
 */
export function useLocation(id) {
  const query = useQuery({
    queryKey: ['location', id],
    queryFn: async () => {
      const response = await locationsApi.getById(id);
      return response.data;
    },
    enabled: !!id,
  });

  return {
    location: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Toggle favorite status for a location
 * Uses server response to directly update both caches for instant sync.
 * @returns {Object} Mutation object with mutate function
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationId) => {
      const response = await locationsApi.toggleFavorite(locationId);
      return { locationId, is_favorited: response.data.is_favorited };
    },
    onSuccess: ({ locationId, is_favorited }) => {
      // Update locations cache (infinite query with pages)
      queryClient.setQueriesData({ queryKey: ['locations'] }, (oldData) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            results: page.results.map((loc) =>
              loc.id === locationId ? { ...loc, is_favorited } : loc
            ),
          })),
        };
      });

      // Update mapMarkers cache (flat array)
      queryClient.setQueryData(['mapMarkers'], (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((marker) =>
          marker.id === locationId ? { ...marker, is_favorited } : marker
        );
      });
    },
  });
}
