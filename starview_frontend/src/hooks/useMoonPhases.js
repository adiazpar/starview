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
} = {}) {
  const queryConfig = {
    queryKey: ['moonPhases', startDate, endDate, lat, lng, keyDatesOnly],
    queryFn: createMoonQueryFn({ startDate, endDate, lat, lng, keyDatesOnly }),
    staleTime: 60 * 60 * 1000,
  };

  // Use suspense query when requested (integrates with React Suspense boundaries)
  const query = suspense
    ? useSuspenseQuery(queryConfig)
    : useQuery({ ...queryConfig, enabled });

  // When keyDatesOnly is true, backend returns { key_dates: [...] } as an array
  // When false, it returns { phases: [...], key_dates: {...} } where key_dates is an object
  const phases = keyDatesOnly
    ? (Array.isArray(query.data?.key_dates) ? query.data.key_dates : [])
    : (query.data?.phases || []);

  return {
    phases,
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
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

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
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  return useMoonPhases({
    startDate: startOfMonth,
    endDate: endOfMonth,
    lat,
    lng,
  });
}

/**
 * Get today's moon phase
 * @param {Object} options - Hook options
 * @param {number} options.lat - Optional latitude
 * @param {number} options.lng - Optional longitude
 * @param {boolean} options.suspense - Use Suspense mode
 * @returns {Object} Query result with todayPhase shortcut
 */
export function useTodayMoonPhase({ lat, lng, suspense = false } = {}) {
  const today = new Date().toISOString().split('T')[0];

  const result = useMoonPhases({
    startDate: today,
    endDate: today,
    lat,
    lng,
    suspense,
  });

  return {
    ...result,
    todayPhase: result.phases[0] || null,
  };
}

export default useMoonPhases;
