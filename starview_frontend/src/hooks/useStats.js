/**
 * useStats Hook
 *
 * React Query hook for fetching platform statistics.
 * Provides caching, automatic refetching, and loading/error states.
 */

import { useQuery } from '@tanstack/react-query';
import statsApi from '../services/stats';

// Minimum threshold to show stats (hide if below this)
const STATS_THRESHOLD = 10;

/**
 * Fetch and cache platform statistics
 * @returns {Object} Query result with stats data and computed showStats flag
 */
export function usePlatformStats() {
  const query = useQuery({
    queryKey: ['platformStats'],
    queryFn: statsApi.getPlatformStats,
  });

  // Compute whether to show stats based on threshold
  const showStats = query.data
    ? query.data.locations.count >= STATS_THRESHOLD &&
      query.data.reviews.count >= STATS_THRESHOLD &&
      query.data.stargazers.count >= STATS_THRESHOLD
    : false;

  return {
    stats: query.data,
    showStats,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
