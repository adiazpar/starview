import { useState, useEffect, useRef } from 'react';
import { useLocations, useLocationsPaginated } from './useLocations';
import { useIsDesktop } from './useMediaQuery';

/**
 * Unified hook for Explore page data fetching.
 * Handles mobile (infinite scroll) vs desktop (pagination) internally.
 *
 * Mobile: Uses infinite scroll with useLocations
 * Desktop: Uses pagination with useLocationsPaginated
 *
 * @param {Object} params - Query parameters (search, filters, etc.)
 * @param {string} filterKey - Stable key that changes when filters change (for resetting page)
 * @returns {Object} Unified data interface for both mobile and desktop
 */
export function useExploreData(params = {}, filterKey = '') {
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState(1);

  // Track previous filter key to detect changes
  const prevFilterKey = useRef(filterKey);

  // Reset page to 1 when filters change
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      prevFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  // Only fetch from the appropriate source based on viewport
  const infiniteQuery = useLocations(params, { enabled: !isDesktop });
  const paginatedQuery = useLocationsPaginated(params, page, { enabled: isDesktop });

  // Select active query for common properties
  const activeQuery = isDesktop ? paginatedQuery : infiniteQuery;

  return {
    // Common data (from active query)
    locations: activeQuery.locations,
    count: activeQuery.count,
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    error: activeQuery.error,

    // Pagination (desktop-only, but always exposed for simplicity)
    page,
    totalPages: paginatedQuery.totalPages,
    setPage,

    // Infinite scroll (mobile-only)
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,

    // Viewport info
    isDesktop,
  };
}
