/**
 * useMoonPhases Hook
 *
 * React Query hook for fetching moon phase data.
 * Provides automatic caching, loading states, and error handling.
 */

import { useQuery } from '@tanstack/react-query';
import moonApi from '../services/moon';

/**
 * Fetch moon phases for a date range
 * @param {Object} options - Hook options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {number} options.lat - Optional latitude for moonrise/moonset
 * @param {number} options.lng - Optional longitude for moonrise/moonset
 * @param {boolean} options.keyDatesOnly - Return only key phase dates
 * @param {boolean} options.enabled - Enable/disable the query
 * @returns {Object} Query result with phases, keyDates, and loading state
 */
export function useMoonPhases({
  startDate,
  endDate,
  lat,
  lng,
  keyDatesOnly = false,
  enabled = true,
} = {}) {
  const query = useQuery({
    queryKey: ['moonPhases', startDate, endDate, lat, lng, keyDatesOnly],
    queryFn: async () => {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (lat !== undefined && lng !== undefined) {
        params.lat = lat;
        params.lng = lng;
      }
      if (keyDatesOnly) params.key_dates_only = true;

      return moonApi.getPhases(params);
    },
    // Cache for 1 hour client-side (backend caches 24 hours)
    staleTime: 60 * 60 * 1000,
    enabled,
  });

  return {
    phases: query.data?.phases || [],
    keyDates: query.data?.key_dates || {},
    location: query.data?.location,
    isLoading: query.isLoading,
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
 * @returns {Object} Query result
 */
export function useWeeklyMoonPhases({ lat, lng } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return useMoonPhases({
    startDate: today,
    endDate: nextWeek,
    lat,
    lng,
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
 * @returns {Object} Query result with todayPhase shortcut
 */
export function useTodayMoonPhase({ lat, lng } = {}) {
  const today = new Date().toISOString().split('T')[0];

  const result = useMoonPhases({
    startDate: today,
    endDate: today,
    lat,
    lng,
  });

  return {
    ...result,
    todayPhase: result.phases[0] || null,
  };
}

export default useMoonPhases;
