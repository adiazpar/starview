/**
 * useWeather Hook
 *
 * React Query hook for fetching weather data.
 * Supports current forecasts and historical averages for future planning.
 * Cloud cover percentage is the key metric for stargazing.
 */

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import weatherApi from '../services/weather';

/**
 * Format date as YYYY-MM-DD for query key
 */
const formatDateKey = (date) => {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Fetch weather data for a location and optional date
 * @param {Object} options - Hook options
 * @param {number} options.lat - Latitude
 * @param {number} options.lng - Longitude
 * @param {Date} options.date - Optional date (defaults to today)
 * @param {boolean} options.enabled - Enable/disable the query
 * @param {boolean} options.suspense - Use Suspense mode
 * @returns {Object} Query result with weather data
 *
 * Data source varies by date:
 * - Today to +16 days: Real forecast (high confidence)
 * - Past dates: Historical archive (high confidence)
 * - +17 days and beyond: 5-year historical average (varies)
 */
export function useWeather({ lat, lng, date, enabled = true, suspense = false } = {}) {
  const hasCoords = lat !== undefined && lng !== undefined;
  const dateKey = formatDateKey(date);

  // Round coordinates to 2 decimal places for cache key consistency
  // This prevents floating point precision issues from creating duplicate cache entries
  const roundedLat = lat !== undefined ? Math.round(lat * 100) / 100 : undefined;
  const roundedLng = lng !== undefined ? Math.round(lng * 100) / 100 : undefined;

  const queryConfig = {
    queryKey: ['weather', roundedLat, roundedLng, dateKey],
    queryFn: () => weatherApi.getForecast({ lat, lng, date }),
    staleTime: 10 * 60 * 1000, // 10 minutes - weather updates hourly
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnMount: true, // Refetch only if stale
    retry: 2,
  };

  const query = suspense
    ? useSuspenseQuery(queryConfig)
    : useQuery({ ...queryConfig, enabled: enabled && hasCoords });

  // Extract daily data for the requested date
  const dailyData = query.data?.daily?.[0] || null;

  // Get cloud cover - prefer daily summary for specific dates, fallback to current
  const cloudCover = dailyData?.summary?.cloud_cover_avg
    ?? query.data?.current?.cloud_cover
    ?? null;

  // Get precipitation data from current conditions
  const current = query.data?.current || null;
  const precipitationType = current?.precipitation_type || 'none';
  const precipitationProbability = current?.precipitation_probability ?? null;
  const visibility = current?.visibility ?? null;

  // Get additional weather metrics (available for all data types)
  const humidity = current?.humidity ?? null;
  const windSpeed = current?.wind_speed ?? null;
  const temperature = current?.temperature ?? null;

  return {
    current,
    hourly: dailyData?.hourly || query.data?.hourly || [],
    daily: query.data?.daily || [],
    location: query.data?.location || null,
    // Cloud cover percentage (0-100, where 0 is clear sky)
    cloudCover,
    // Precipitation info for weather condition display
    precipitationType,
    precipitationProbability,
    visibility,
    // Additional weather metrics for stargazing
    humidity,       // Relative humidity % (affects seeing)
    windSpeed,      // Wind speed km/h (affects telescope stability)
    temperature,    // Temperature °C (comfort/planning)
    // Data type: 'forecast', 'historical', or 'historical_average'
    dataType: dailyData?.data_type || 'forecast',
    // Confidence level: 'high', 'medium', or 'low'
    confidence: dailyData?.confidence || 'high',
    // Number of years averaged (only for historical_average)
    yearsAveraged: dailyData?.years_averaged || null,
    isLoading: query.isLoading ?? false,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useWeather;
