/**
 * useMoonPhases Hook
 *
 * React Query hook for fetching moon phase data.
 * Provides automatic caching, loading states, and error handling.
 * Supports Suspense mode for seamless loading with React.lazy().
 */

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import moonApi from '../services/moon';

/**
 * Format a Date object as YYYY-MM-DD in local timezone
 * IMPORTANT: Do not use toISOString() as it returns UTC date,
 * which can be the wrong day when it's evening in western timezones.
 */
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Shared query function for moon phases
 */
const createMoonQueryFn = ({ startDate, endDate, lat, lng, keyDatesOnly }) => {
  return async () => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (lat !== undefined && lng !== undefined) {
      params.lat = lat;
      params.lng = lng;
    }
    if (keyDatesOnly) params.key_dates_only = true;

    return moonApi.getPhases(params);
  };
};

/**
 * Fetch moon phases for a date range
 * @param {Object} options - Hook options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {number} options.lat - Optional latitude for moonrise/moonset
 * @param {number} options.lng - Optional longitude for moonrise/moonset
 * @param {boolean} options.keyDatesOnly - Return only key phase dates
 * @param {boolean} options.enabled - Enable/disable the query
 * @param {boolean} options.suspense - Use Suspense mode (integrates with React.lazy)
 * @param {number} options.refetchInterval - Auto-refetch interval in ms (for real-time updates)
 * @returns {Object} Query result with phases, keyDates, and loading state
 */
export function useMoonPhases({
  startDate,
  endDate,
  lat,
  lng,
  keyDatesOnly = false,
  enabled = true,
  suspense = false,
  refetchInterval,
} = {}) {
  // Round coordinates for consistent cache keys
  const roundedLat = lat !== undefined ? Math.round(lat * 100) / 100 : undefined;
  const roundedLng = lng !== undefined ? Math.round(lng * 100) / 100 : undefined;

  const queryConfig = {
    queryKey: ['moonPhases', startDate, endDate, roundedLat, roundedLng, keyDatesOnly],
    queryFn: createMoonQueryFn({ startDate, endDate, lat, lng, keyDatesOnly }),
    staleTime: 5 * 60 * 1000, // 5 minutes - moon data changes slowly
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    refetchOnMount: true, // Refetch only if stale
    refetchInterval, // Auto-refetch for real-time updates (undefined = disabled)
  };

  // Use suspense query when requested (integrates with React Suspense boundaries)
  const query = suspense
    ? useSuspenseQuery(queryConfig)
    : useQuery({ ...queryConfig, enabled });

  // When keyDatesOnly is true, backend returns { key_dates: [...] } as an array
  // When false, it returns { daily: [...], current: {...}, key_dates: {...} }
  // Note: API returns 'daily' array, we map to 'phases' for backward compatibility
  const phases = keyDatesOnly
    ? (Array.isArray(query.data?.key_dates) ? query.data.key_dates : [])
    : (query.data?.daily || []);

  return {
    phases,
    current: query.data?.current || null, // Real-time moon data with moonrise/moonset
    keyDates: keyDatesOnly ? {} : (query.data?.key_dates || {}),
    location: query.data?.location,
    isLoading: query.isLoading ?? false,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch moon phases for current week
 * @param {Object} options - Hook options
 * @param {number} options.lat - Optional latitude
 * @param {number} options.lng - Optional longitude
 * @param {boolean} options.suspense - Use Suspense mode
 * @returns {Object} Query result
 */
export function useWeeklyMoonPhases({ lat, lng, suspense = false } = {}) {
  const today = formatLocalDate(new Date());
  const nextWeek = formatLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  return useMoonPhases({
    startDate: today,
    endDate: nextWeek,
    lat,
    lng,
    suspense,
  });
}

/**
 * Fetch moon phases for current month
 * @param {Object} options - Hook options
 * @param {number} options.lat - Optional latitude
 * @param {number} options.lng - Optional longitude
 * @returns {Object} Query result
 */
export function useMonthlyMoonPhases({ lat, lng } = {}) {
  const today = new Date();
  const startOfMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const endOfMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  return useMoonPhases({
    startDate: startOfMonth,
    endDate: endOfMonth,
    lat,
    lng,
  });
}

/**
 * Get today's moon phase (NOW mode)
 * @param {Object} options - Hook options
 * @param {number} options.lat - Optional latitude
 * @param {number} options.lng - Optional longitude
 * @param {boolean} options.suspense - Use Suspense mode
 * @param {number} options.refetchInterval - Auto-refetch interval in ms (for real-time updates)
 * @returns {Object} Query result with todayPhase shortcut
 */
export function useTodayMoonPhase({ lat, lng, suspense = false, refetchInterval } = {}) {
  // Don't pass dates - API defaults to "now mode" (today only)
  const result = useMoonPhases({
    lat,
    lng,
    suspense,
    refetchInterval,
  });

  // Use 'current' for real-time data (includes moonrise/moonset/rotation)
  // Fall back to daily[0] if current not available
  return {
    ...result,
    todayPhase: result.current || result.phases[0] || null,
  };
}

export default useMoonPhases;
