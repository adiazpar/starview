/**
 * useNighttimeWeather Hook
 *
 * Fetches weather data for the nighttime range (6PM today to 6AM tomorrow)
 * in a single API call. Optimized for the Tonight page.
 *
 * Improvements over separate useWeather calls:
 * - Single API request instead of two
 * - Cache key aligned with backend (1 decimal ~11km grid)
 * - Returns pre-filtered nighttime hours
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import weatherApi from '../services/weather';
import { getNighttimeHours, getNighttimeWeatherAverages } from '../pages/Tonight/utils';

/**
 * Format date as YYYY-MM-DD for cache key
 */
const formatDateKey = (date) => {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Fetch weather for tonight's stargazing window (6PM-6AM)
 * @param {Object} options - Hook options
 * @param {number} options.lat - Latitude
 * @param {number} options.lng - Longitude
 * @param {boolean} options.enabled - Enable/disable the query
 * @returns {Object} Nighttime weather data with hourly breakdown
 */
export function useNighttimeWeather({ lat, lng, enabled = true } = {}) {
  const hasCoords = lat !== undefined && lng !== undefined;

  // Calculate date range for tonight (today + tomorrow for 6PM-6AM span)
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  // Round coordinates to 1 decimal (~11km) to match backend cache precision
  // This prevents frontend cache fragmentation within the same backend grid cell
  const roundedLat = lat !== undefined ? Math.round(lat * 10) / 10 : undefined;
  const roundedLng = lng !== undefined ? Math.round(lng * 10) / 10 : undefined;

  const startDateKey = formatDateKey(today);
  const endDateKey = formatDateKey(tomorrow);

  const query = useQuery({
    queryKey: ['weather-nighttime', roundedLat, roundedLng, startDateKey, endDateKey],
    queryFn: () => weatherApi.getForecastRange({
      lat,
      lng,
      startDate: today,
      endDate: tomorrow,
    }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnMount: true,
    retry: 2,
    enabled: enabled && hasCoords,
  });

  // Combine hourly data from both days
  const allHourly = useMemo(() => {
    if (!query.data?.daily) return [];
    return query.data.daily.flatMap(day => day.hourly || []);
  }, [query.data]);

  // Filter to nighttime hours (6PM-6AM)
  const nighttimeHours = useMemo(() => {
    return getNighttimeHours(allHourly);
  }, [allHourly]);

  // Calculate nighttime averages
  const nighttimeAverages = useMemo(() => {
    return getNighttimeWeatherAverages(nighttimeHours);
  }, [nighttimeHours]);

  // Current conditions from the API
  const current = query.data?.current || null;

  return {
    // Current conditions (real-time)
    current,
    currentCloudCover: current?.cloud_cover ?? null,
    precipitationType: current?.precipitation_type || 'none',
    precipitationProbability: current?.precipitation_probability ?? null,

    // Nighttime data (6PM-6AM)
    nighttimeHours,
    nighttimeAverages,

    // Convenience: cloud cover for scoring (prefer nighttime avg)
    cloudCover: nighttimeAverages.cloudCover ?? current?.cloud_cover ?? null,
    humidity: nighttimeAverages.humidity ?? current?.humidity ?? null,
    windSpeed: nighttimeAverages.windSpeed ?? current?.wind_speed ?? null,
    temperature: nighttimeAverages.temperature ?? current?.temperature ?? null,

    // Query state
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useNighttimeWeather;
