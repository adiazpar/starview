import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { profileApi } from '../services/profile';
import {
  formatDistance as formatDistanceUtil,
  formatElevation as formatElevationUtil,
  formatArea as formatAreaUtil,
  formatRouteDistance as formatRouteDistanceUtil,
  formatRadius as formatRadiusUtil,
  formatWindSpeed as formatWindSpeedUtil,
  formatVisibility as formatVisibilityUtil,
  getWindSpeedUnit as getWindSpeedUnitUtil,
  formatTemperature as formatTemperatureUtil,
} from '../utils/units';

const STORAGE_KEY = 'starview_unit_preference';
const DEFAULT_UNITS = 'metric';

/**
 * useUnits - Unified unit preference management
 *
 * For authenticated users: reads from user profile, syncs to backend
 * For guests: reads/writes to localStorage
 *
 * @returns {Object} Unit preference state and formatting functions
 * @returns {string} units - 'metric' or 'imperial'
 * @returns {Function} setUnits - Function to update preference
 * @returns {boolean} isUpdating - Whether a backend sync is in progress
 * @returns {Function} formatDistance - (km) => formatted string
 * @returns {Function} formatElevation - (meters) => formatted string
 * @returns {Function} formatArea - (km2) => formatted string
 * @returns {Function} formatRouteDistance - (meters) => formatted string
 */
export function useUnits() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  // Initialize from localStorage (immediate, no flicker)
  const [units, setUnitsState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'imperial' ? 'imperial' : DEFAULT_UNITS;
    } catch {
      return DEFAULT_UNITS;
    }
  });

  const [isUpdating, setIsUpdating] = useState(false);

  // Sync from user profile when authenticated
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && user?.unit_preference) {
      setUnitsState(user.unit_preference);
      // Also update localStorage for consistency
      try {
        localStorage.setItem(STORAGE_KEY, user.unit_preference);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [isAuthenticated, user?.unit_preference, authLoading]);

  // Listen for cross-tab/window sync
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setUnitsState(e.newValue === 'imperial' ? 'imperial' : 'metric');
      }
    };

    // Custom event for same-tab sync
    const handleUnitsChange = (e) => {
      setUnitsState(e.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('unitsChange', handleUnitsChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('unitsChange', handleUnitsChange);
    };
  }, []);

  // Set units with backend sync for authenticated users
  const setUnits = useCallback(async (newUnits) => {
    if (newUnits !== 'metric' && newUnits !== 'imperial') return;
    if (newUnits === units) return;

    // Optimistic update
    setUnitsState(newUnits);

    // Update localStorage
    try {
      localStorage.setItem(STORAGE_KEY, newUnits);
    } catch {
      // Ignore localStorage errors
    }

    // Dispatch event for same-tab sync
    window.dispatchEvent(new CustomEvent('unitsChange', { detail: newUnits }));

    // Sync to backend if authenticated
    if (isAuthenticated) {
      setIsUpdating(true);
      try {
        await profileApi.updateUnitPreference({ unit_preference: newUnits });
      } catch (error) {
        console.error('Failed to sync unit preference:', error);
        // Don't revert - localStorage is the fallback
      } finally {
        setIsUpdating(false);
      }
    }
  }, [units, isAuthenticated]);

  // Memoized formatting functions that include current units
  const formatDistance = useCallback(
    (km) => formatDistanceUtil(km, units),
    [units]
  );

  const formatElevation = useCallback(
    (meters) => formatElevationUtil(meters, units),
    [units]
  );

  const formatArea = useCallback(
    (km2) => formatAreaUtil(km2, units),
    [units]
  );

  const formatRouteDistance = useCallback(
    (meters) => formatRouteDistanceUtil(meters, units),
    [units]
  );

  const formatRadius = useCallback(
    (miles) => formatRadiusUtil(miles, units),
    [units]
  );

  const formatWindSpeed = useCallback(
    (kmh) => formatWindSpeedUtil(kmh, units),
    [units]
  );

  const formatVisibility = useCallback(
    (km) => formatVisibilityUtil(km, units),
    [units]
  );

  const windSpeedUnit = useMemo(
    () => getWindSpeedUnitUtil(units),
    [units]
  );

  const formatTemperature = useCallback(
    (celsius) => formatTemperatureUtil(celsius, units),
    [units]
  );

  return useMemo(() => ({
    units,
    setUnits,
    isUpdating,
    formatDistance,
    formatElevation,
    formatArea,
    formatRouteDistance,
    formatRadius,
    formatWindSpeed,
    formatVisibility,
    formatTemperature,
    windSpeedUnit,
  }), [units, setUnits, isUpdating, formatDistance, formatElevation, formatArea, formatRouteDistance, formatRadius, formatWindSpeed, formatVisibility, formatTemperature, windSpeedUnit]);
}

export default useUnits;
