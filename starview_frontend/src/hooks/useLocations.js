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
 * @param {Object} options - Additional options (enabled, etc.)
 * @returns {Object} Query result with locations data and pagination controls
 */
export function useLocations(params = {}, options = {}) {
  const query = useInfiniteQuery({
    queryKey: ['locations', 'infinite', params],
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
    ...options,
  });

  // Flatten all pages into a single array of locations, deduplicating by ID
  const allResults = query.data?.pages.flatMap((page) => page.results) || [];
  const locations = [...new Map(allResults.map((loc) => [loc.id, loc])).values()];

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
 * Fetch and cache locations list with pagination support (for desktop)
 * @param {Object} params - Query parameters (search, filters, etc.)
 * @param {number} page - Current page number
 * @param {Object} options - Additional options (enabled, etc.)
 * @returns {Object} Query result with locations data and pagination info
 */
export function useLocationsPaginated(params = {}, page = 1, options = {}) {
  const query = useQuery({
    queryKey: ['locations', 'paginated', params, page],
    queryFn: async () => {
      const response = await locationsApi.getAll({ ...params, page });
      return response.data;
    },
    ...options,
  });

  const totalPages = query.data ? Math.ceil(query.data.count / 10) : 0;

  return {
    locations: query.data?.results || [],
    count: query.data?.count || 0,
    totalPages,
    currentPage: page,
    hasNextPage: !!query.data?.next,
    hasPrevPage: !!query.data?.previous,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
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
      // Update infinite scroll cache (has pages structure)
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (oldData) => {
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

      // Update paginated cache (flat results structure)
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (oldData) => {
        if (!oldData?.results) return oldData;
        return {
          ...oldData,
          results: oldData.results.map((loc) =>
            loc.id === locationId ? { ...loc, is_favorited } : loc
          ),
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
