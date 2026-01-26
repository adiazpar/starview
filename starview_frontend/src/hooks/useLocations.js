/**
 * useLocations Hook
 *
 * React Query hooks for fetching and mutating locations.
 * Provides caching, automatic refetching, and loading/error states.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../services/locations';

/**
 * Fetch popular locations near user coordinates
 * @param {number} lat - User latitude
 * @param {number} lng - User longitude
 * @param {Object} options - Additional React Query options
 * @returns {Object} Query result with locations data
 */
export function usePopularNearby(lat, lng, options = {}) {
  return useQuery({
    queryKey: ['locations', 'popularNearby', lat?.toFixed(1), lng?.toFixed(1)],
    queryFn: async () => {
      const response = await locationsApi.getPopularNearby({ lat, lng });
      return response.data;
    },
    enabled: Boolean(lat && lng),
    staleTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

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

  // Flatten pages into a single array of locations, deduplicating by ID
  const pages = query.data?.pages || [];
  const allResults = pages.flatMap((page) => page.results);
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
 * Uses optimistic updates for instant UI feedback with rollback on error.
 * @returns {Object} Mutation object with mutate function
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    // Force mutation to run even when offline (so we can detect failure and rollback)
    networkMode: 'always',
    mutationFn: async (locationId) => {
      const response = await locationsApi.toggleFavorite(locationId);
      return { locationId, is_favorited: response.data.is_favorited };
    },

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    onMutate: async (locationId) => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      await queryClient.cancelQueries({ queryKey: ['mapGeoJSON'] });
      // Use string ID to match useLocation's query key (URL params are strings)
      const locationIdStr = String(locationId);
      await queryClient.cancelQueries({ queryKey: ['location', locationIdStr] });

      // Snapshot previous values for rollback (use getQueriesData for partial key matching)
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['locations', 'infinite'] });
      const previousPaginated = queryClient.getQueriesData({ queryKey: ['locations', 'paginated'] });
      const previousPopularNearby = queryClient.getQueriesData({ queryKey: ['locations', 'popularNearby'] });
      // Match all mapGeoJSON queries (base + bbox variants)
      const previousMapGeoJSON = queryClient.getQueriesData({ queryKey: ['mapGeoJSON'] });
      // Single location detail cache (use string ID)
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);

      // Helper to toggle is_favorited optimistically
      const toggleFavorite = (loc) =>
        loc.id === locationId ? { ...loc, is_favorited: !loc.is_favorited } : loc;

      // Helper to toggle is_favorited in GeoJSON feature
      const toggleFeatureFavorite = (feature) =>
        feature.properties.id === locationId
          ? { ...feature, properties: { ...feature.properties, is_favorited: !feature.properties.is_favorited } }
          : feature;

      // Optimistically update infinite scroll cache (use setQueriesData for partial key matching)
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map(toggleFavorite),
          })),
        };
      });

      // Optimistically update paginated caches
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (old) => {
        if (!old?.results) return old;
        return { ...old, results: old.results.map(toggleFavorite) };
      });

      // Optimistically update popular nearby cache (home page carousel)
      queryClient.setQueriesData({ queryKey: ['locations', 'popularNearby'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(toggleFavorite);
      });

      // Optimistically update all map GeoJSON caches (base + bbox variants)
      queryClient.setQueriesData({ queryKey: ['mapGeoJSON'] }, (old) => {
        if (!old?.features) return old;
        return { ...old, features: old.features.map(toggleFeatureFavorite) };
      });

      // Optimistically update single location detail cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], {
          ...previousLocation,
          is_favorited: !previousLocation.is_favorited,
        });
      }

      // Return context for rollback
      return { previousInfinite, previousPaginated, previousPopularNearby, previousMapGeoJSON, previousLocation, locationIdStr };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, locationId, context) => {
      // Restore infinite scroll cache
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore paginated cache
      if (context?.previousPaginated) {
        context.previousPaginated.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore popular nearby cache
      if (context?.previousPopularNearby) {
        context.previousPopularNearby.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore all map GeoJSON caches
      if (context?.previousMapGeoJSON) {
        context.previousMapGeoJSON.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore single location detail cache
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', context.locationIdStr], context.previousLocation);
      }
    },

    // VALIDATE: Ensure cache matches server state (handles race conditions)
    onSuccess: ({ locationId, is_favorited }) => {
      const setFavoriteState = (loc) =>
        loc.id === locationId ? { ...loc, is_favorited } : loc;

      // Helper to set is_favorited in GeoJSON feature
      const setFeatureFavoriteState = (feature) =>
        feature.properties.id === locationId
          ? { ...feature, properties: { ...feature.properties, is_favorited } }
          : feature;

      // Update infinite scroll cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map(setFavoriteState),
          })),
        };
      });

      // Update paginated cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (old) => {
        if (!old?.results) return old;
        return { ...old, results: old.results.map(setFavoriteState) };
      });

      // Update popular nearby cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'popularNearby'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(setFavoriteState);
      });

      // Update all map GeoJSON caches with server response
      queryClient.setQueriesData({ queryKey: ['mapGeoJSON'] }, (old) => {
        if (!old?.features) return old;
        return { ...old, features: old.features.map(setFeatureFavoriteState) };
      });

      // Update single location detail cache with server response (use string ID)
      queryClient.setQueryData(['location', String(locationId)], (old) => {
        if (!old) return old;
        return { ...old, is_favorited };
      });
    },
  });
}

/**
 * Toggle visited status for a location
 * Uses optimistic updates for instant UI feedback with rollback on error.
 * Also handles badge notifications when visiting new locations.
 * @returns {Object} Mutation object with mutate function
 */
export function useToggleVisited() {
  const queryClient = useQueryClient();

  return useMutation({
    // Force mutation to run even when offline (so we can detect failure and rollback)
    networkMode: 'always',
    mutationFn: async (locationId) => {
      const response = await locationsApi.toggleVisited(locationId);
      return {
        locationId,
        is_visited: response.data.is_visited,
        newly_earned_badges: response.data.newly_earned_badges || [],
      };
    },

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    onMutate: async (locationId) => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      await queryClient.cancelQueries({ queryKey: ['mapGeoJSON'] });
      // Use string ID to match useLocation's query key (URL params are strings)
      const locationIdStr = String(locationId);
      await queryClient.cancelQueries({ queryKey: ['location', locationIdStr] });

      // Snapshot previous values for rollback (use getQueriesData for partial key matching)
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['locations', 'infinite'] });
      const previousPaginated = queryClient.getQueriesData({ queryKey: ['locations', 'paginated'] });
      const previousPopularNearby = queryClient.getQueriesData({ queryKey: ['locations', 'popularNearby'] });
      // Match all mapGeoJSON queries (base + bbox variants)
      const previousMapGeoJSON = queryClient.getQueriesData({ queryKey: ['mapGeoJSON'] });
      // Single location detail cache (use string ID)
      const previousLocation = queryClient.getQueryData(['location', locationIdStr]);

      // Helper to toggle is_visited optimistically
      const toggleVisited = (loc) =>
        loc.id === locationId ? { ...loc, is_visited: !loc.is_visited } : loc;

      // Helper to toggle is_visited in GeoJSON feature
      const toggleFeatureVisited = (feature) =>
        feature.properties.id === locationId
          ? { ...feature, properties: { ...feature.properties, is_visited: !feature.properties.is_visited } }
          : feature;

      // Optimistically update infinite scroll cache (use setQueriesData for partial key matching)
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map(toggleVisited),
          })),
        };
      });

      // Optimistically update paginated caches
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (old) => {
        if (!old?.results) return old;
        return { ...old, results: old.results.map(toggleVisited) };
      });

      // Optimistically update popular nearby cache (home page carousel)
      queryClient.setQueriesData({ queryKey: ['locations', 'popularNearby'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(toggleVisited);
      });

      // Optimistically update all map GeoJSON caches (base + bbox variants)
      queryClient.setQueriesData({ queryKey: ['mapGeoJSON'] }, (old) => {
        if (!old?.features) return old;
        return { ...old, features: old.features.map(toggleFeatureVisited) };
      });

      // Optimistically update single location detail cache
      if (previousLocation) {
        queryClient.setQueryData(['location', locationIdStr], {
          ...previousLocation,
          is_visited: !previousLocation.is_visited,
        });
      }

      // Return context for rollback
      return { previousInfinite, previousPaginated, previousPopularNearby, previousMapGeoJSON, previousLocation, locationIdStr };
    },

    // ROLLBACK: Restore previous state on error
    onError: (err, locationId, context) => {
      // Restore infinite scroll cache
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore paginated cache
      if (context?.previousPaginated) {
        context.previousPaginated.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore popular nearby cache
      if (context?.previousPopularNearby) {
        context.previousPopularNearby.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore all map GeoJSON caches
      if (context?.previousMapGeoJSON) {
        context.previousMapGeoJSON.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      // Restore single location detail cache
      if (context?.previousLocation) {
        queryClient.setQueryData(['location', context.locationIdStr], context.previousLocation);
      }
    },

    // VALIDATE: Ensure cache matches server state (handles race conditions)
    onSuccess: ({ locationId, is_visited }) => {
      const setVisitedState = (loc) =>
        loc.id === locationId ? { ...loc, is_visited } : loc;

      // Helper to set is_visited in GeoJSON feature
      const setFeatureVisitedState = (feature) =>
        feature.properties.id === locationId
          ? { ...feature, properties: { ...feature.properties, is_visited } }
          : feature;

      // Update infinite scroll cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map(setVisitedState),
          })),
        };
      });

      // Update paginated cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'paginated'] }, (old) => {
        if (!old?.results) return old;
        return { ...old, results: old.results.map(setVisitedState) };
      });

      // Update popular nearby cache with server response
      queryClient.setQueriesData({ queryKey: ['locations', 'popularNearby'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(setVisitedState);
      });

      // Update all map GeoJSON caches with server response
      queryClient.setQueriesData({ queryKey: ['mapGeoJSON'] }, (old) => {
        if (!old?.features) return old;
        return { ...old, features: old.features.map(setFeatureVisitedState) };
      });

      // Update single location detail cache with server response (use string ID)
      queryClient.setQueryData(['location', String(locationId)], (old) => {
        if (!old) return old;
        return { ...old, is_visited };
      });
    },
  });
}
