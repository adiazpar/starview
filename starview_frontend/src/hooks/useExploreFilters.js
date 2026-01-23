/**
 * useExploreFilters Hook
 *
 * Manages filter state for the Explore page via URL query params.
 * Provides individual setters and clear function for all filters.
 *
 * URL State Schema:
 * - search: Text search (name, address, region, country)
 * - type: Comma-separated location types
 * - minRating: Minimum rating (1-5)
 * - verified: Only verified locations
 * - near: Coordinates "lat,lng" or "me" for current location
 * - nearPlace: Human-readable place name for display
 * - radius: Distance in miles (default: 50)
 * - maxBortle: Maximum Bortle class (1-9, lower is darker)
 * - sort: Sort order (default: -created_at)
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';

// Valid location types (must match backend LOCATION_TYPES)
const VALID_TYPES = ['dark_sky_site', 'observatory', 'campground', 'viewpoint', 'other'];

// Valid sort options
const VALID_SORTS = [
  '-created_at', 'created_at',
  '-average_rating', 'average_rating',
  '-review_count', 'review_count',
  'distance', '-distance',
];

// Default values
const DEFAULTS = {
  radius: 50,
  sort: '-created_at',  // Fallback when no location
  sortWithLocation: 'distance',  // Default when user has location
};

/**
 * Parse and validate filter parameters from URL
 */
function parseFilters(searchParams) {
  // Text search
  const search = searchParams.get('search') || '';

  // Location types (comma-separated, validated)
  const typeParam = searchParams.get('type') || '';
  const types = typeParam
    .split(',')
    .filter(t => VALID_TYPES.includes(t));

  // Minimum rating (1-5)
  const minRatingParam = searchParams.get('minRating');
  const minRating = minRatingParam ? parseInt(minRatingParam, 10) : null;
  const validMinRating = minRating && minRating >= 1 && minRating <= 5 ? minRating : null;

  // Verified filter
  const verified = searchParams.get('verified') === 'true';

  // Distance filter
  const near = searchParams.get('near') || '';
  const nearPlace = searchParams.get('nearPlace') || '';
  const radiusParam = searchParams.get('radius');
  const radius = radiusParam ? parseInt(radiusParam, 10) : DEFAULTS.radius;

  // Bortle filter (1-9, lower is darker sky)
  const maxBortleParam = searchParams.get('maxBortle');
  const maxBortle = maxBortleParam ? parseInt(maxBortleParam, 10) : null;
  const validMaxBortle = maxBortle && maxBortle >= 1 && maxBortle <= 9 ? maxBortle : null;

  // Sort order
  const sortParam = searchParams.get('sort') || DEFAULTS.sort;
  const sort = VALID_SORTS.includes(sortParam) ? sortParam : DEFAULTS.sort;

  return {
    search,
    types,
    minRating: validMinRating,
    verified,
    near,
    nearPlace,
    radius,
    maxBortle: validMaxBortle,
    sort,
  };
}

/**
 * Build API params object from filter state
 * @param {Object} filters - Parsed filter values
 * @param {string|null} resolvedNear - Resolved coordinates from distance filter
 * @param {Object|null} userLocation - User's location (for distance sorting without filter)
 */
function buildApiParams(filters, resolvedNear, userLocation) {
  const params = {};

  if (filters.search) {
    params.search = filters.search;
  }

  if (filters.types.length > 0) {
    params.type = filters.types.join(',');
  }

  if (filters.minRating) {
    params.minRating = filters.minRating;
  }

  if (filters.verified) {
    params.verified = 'true';
  }

  // Use resolved coordinates (handles "me" -> actual coords)
  if (resolvedNear) {
    params.near = resolvedNear;
    params.radius = filters.radius;
  }

  if (filters.maxBortle) {
    params.maxBortle = filters.maxBortle;
  }

  // Always send sort param (backend needs it for distance sorting)
  if (filters.sort) {
    params.sort = filters.sort;
  }

  // For distance sorting without explicit distance filter, use user's location
  if (filters.sort === 'distance' && !resolvedNear && userLocation) {
    params.near = `${userLocation.latitude},${userLocation.longitude}`;
    params.radius = 12500; // ~20,000km covers entire Earth
  }

  return params;
}

/**
 * Hook for managing explore page filters via URL state
 */
export function useExploreFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { location: userLocation, permissionState, source: locationSource, requestCurrentLocation } = useLocation();

  // Extract primitives for stable dependencies (prevents re-renders when object reference changes)
  const userLat = userLocation?.latitude;
  const userLng = userLocation?.longitude;
  const userName = userLocation?.name;
  const hasUserLocation = userLat !== undefined && userLng !== undefined;

  // Parse current filters from URL
  const parsedFilters = useMemo(() => parseFilters(searchParams), [searchParams]);

  // Determine effective sort: use "distance" as default when user has location
  const hasExplicitSort = searchParams.has('sort');
  const effectiveSort = useMemo(() => {
    if (hasExplicitSort) {
      return parsedFilters.sort;
    }
    // Default to "Nearby" when user has location, otherwise "Newest"
    return hasUserLocation ? DEFAULTS.sortWithLocation : DEFAULTS.sort;
  }, [hasExplicitSort, parsedFilters.sort, hasUserLocation]);

  // Combine parsed filters with effective sort
  const filters = useMemo(() => ({
    ...parsedFilters,
    sort: effectiveSort,
  }), [parsedFilters, effectiveSort]);

  // Track if this is the initial render (to prevent unnecessary URL updates)
  const isInitialRender = useRef(true);
  useEffect(() => {
    isInitialRender.current = false;
  }, []);

  // Resolve "near=me" to actual coordinates
  const resolvedNear = useMemo(() => {
    if (!filters.near) return null;

    if (filters.near === 'me') {
      // If we have user location, use it
      if (hasUserLocation) {
        return `${userLat},${userLng}`;
      }
      // If permission denied or location unavailable, can't resolve
      return null;
    }

    // Already coordinates
    return filters.near;
  }, [filters.near, hasUserLocation, userLat, userLng]);

  // Build API params using primitives for stable dependencies
  const apiParams = useMemo(() => {
    const params = {};

    if (filters.search) {
      params.search = filters.search;
    }

    if (filters.types.length > 0) {
      params.type = filters.types.join(',');
    }

    if (filters.minRating) {
      params.minRating = filters.minRating;
    }

    if (filters.verified) {
      params.verified = 'true';
    }

    // Use resolved coordinates (handles "me" -> actual coords)
    if (resolvedNear) {
      params.near = resolvedNear;
      params.radius = filters.radius;
    }

    if (filters.maxBortle) {
      params.maxBortle = filters.maxBortle;
    }

    // Always send sort param (backend needs it for distance sorting)
    if (filters.sort) {
      params.sort = filters.sort;
    }

    // For distance sorting without explicit distance filter, use user's location
    if (filters.sort === 'distance' && !resolvedNear && hasUserLocation) {
      params.near = `${userLat},${userLng}`;
      params.radius = 12500; // ~20,000km covers entire Earth
    }

    return params;
  }, [filters, resolvedNear, hasUserLocation, userLat, userLng]);

  // Stable key for query invalidation (changes when filters change)
  const filterKey = useMemo(
    () => JSON.stringify(apiParams),
    [apiParams]
  );

  // Count active filters (excluding sort)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.types.length > 0) count++;
    if (filters.minRating) count++;
    if (filters.verified) count++;
    if (filters.near) count++;
    if (filters.maxBortle) count++;
    return count;
  }, [filters]);

  // Update URL params (preserves other params like 'view')
  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);

      // Reset page to 1 when filters change
      next.delete('page');

      // Apply updates
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || value === false) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          if (value.length > 0) {
            next.set(key, value.join(','));
          } else {
            next.delete(key);
          }
        } else {
          next.set(key, String(value));
        }
      });

      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Individual setters
  const setSearch = useCallback((value) => {
    updateParams({ search: value });
  }, [updateParams]);

  const setTypes = useCallback((value) => {
    updateParams({ type: value });
  }, [updateParams]);

  const setMinRating = useCallback((value) => {
    updateParams({ minRating: value });
  }, [updateParams]);

  const setVerified = useCallback((value) => {
    updateParams({ verified: value ? 'true' : null });
  }, [updateParams]);

  const setMaxBortle = useCallback((value) => {
    updateParams({ maxBortle: value });
  }, [updateParams]);

  const setNear = useCallback((coords, placeName) => {
    updateParams({
      near: coords,
      nearPlace: placeName || null,
    });
  }, [updateParams]);

  // Set radius - optionally also enables "near me" in same update
  const setRadius = useCallback((value, enableNearMe = false) => {
    const updates = { radius: value !== DEFAULTS.radius ? value : null };

    // When enabling near filter, include it in same update to avoid race condition
    if (enableNearMe && hasUserLocation) {
      updates.near = 'me';
      updates.nearPlace = userName || 'My Location';
    }

    updateParams(updates);
  }, [updateParams, hasUserLocation, userName]);

  const setSort = useCallback((value) => {
    // Always store explicit sort choice in URL
    // Only clear if it matches the current effective default
    const currentDefault = hasUserLocation ? DEFAULTS.sortWithLocation : DEFAULTS.sort;
    updateParams({ sort: value !== currentDefault ? value : null });
  }, [updateParams, hasUserLocation]);

  // Request "Near Me" location
  const requestNearMe = useCallback(async () => {
    // If we already have a location (from browser or IP), use it
    if (hasUserLocation) {
      // Use location name from context (already formatted)
      const placeName = userName || 'My Location';
      updateParams({
        near: 'me',
        nearPlace: placeName,
      });
      return { success: true, source: locationSource };
    }

    // If geolocation denied and no IP location available, return failure
    if (permissionState === 'denied') {
      return { success: false, reason: 'denied' };
    }

    // Try to get location (will prompt user for browser geolocation)
    await requestCurrentLocation();

    // Note: requestCurrentLocation is async but location won't update until next render
    // The LocationContext will handle the fallback chain internally
    // For now, return pending - the UI should update when location changes
    return { success: false, reason: 'pending' };
  }, [permissionState, hasUserLocation, userName, locationSource, requestCurrentLocation, updateParams]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams();
      // Preserve non-filter params
      const viewParam = prev.get('view');
      if (viewParam) {
        next.set('view', viewParam);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Check if distance filter is waiting for location
  const isLocationPending = filters.near === 'me' && !hasUserLocation;

  return {
    // Current filter values
    filters,

    // Resolved coordinates (null if "me" can't be resolved)
    resolvedNear,

    // API-ready params object
    apiParams,

    // Stable key for query invalidation
    filterKey,

    // Active filter count (for badge display)
    activeFilterCount,

    // Individual setters
    setSearch,
    setTypes,
    setMinRating,
    setVerified,
    setMaxBortle,
    setNear,
    setRadius,
    setSort,

    // Special "Near Me" handler
    requestNearMe,

    // Clear all filters
    clearFilters,

    // Location status
    permissionState,
    locationSource, // 'browser' | 'ip' | null
    isLocationPending,

    // Valid options (for UI)
    validTypes: VALID_TYPES,
    validSorts: VALID_SORTS,
    defaultRadius: DEFAULTS.radius,
  };
}

export default useExploreFilters;
