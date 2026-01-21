/* Explore Page
 * Displays stargazing locations with map/list toggle.
 * Mobile: infinite scroll, Desktop: pagination with sticky map.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useExploreData } from '../../hooks/useExploreData';
import { useExploreFilters } from '../../hooks/useExploreFilters';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { useSEO } from '../../hooks/useSEO';
import LocationCard from '../../components/explore/LocationCard';
import VirtualizedLocationList from '../../components/explore/VirtualizedLocationList';
import ViewToggle from '../../components/explore/ViewToggle';
import Pagination from '../../components/explore/Pagination';
import SortDropdown from '../../components/explore/SortDropdown';
import './styles.css';

// Lazy load ExploreMap - defers loading Mapbox GL JS (~500KB) until needed
const ExploreMap = lazy(() => import('../../components/explore/ExploreMap'));

function ExplorePage() {
  useSEO({
    title: 'Explore Stargazing Locations | Starview',
    description: 'Discover the best stargazing spots near you. Browse user-reviewed dark sky locations with light pollution ratings, accessibility info, and photos.',
    path: '/explore',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialView = searchParams.get('view') === 'map' ? 'map' : 'list';
  // Use ref to preserve initial value across re-renders (survives URL cleanup during lazy load)
  const initialLightPollutionRef = useRef(searchParams.get('lightPollution') === 'true');
  const [view, setView] = useState(initialView);
  const mapViewport = useRef(null); // Persist map position across view toggles

  // Clean up URL after consuming query params (keeps view=map, removes one-time params)
  useEffect(() => {
    const hasLightPollution = searchParams.get('lightPollution');
    if (hasLightPollution) {
      // Replace URL to remove lightPollution param, keep view param if map
      const newUrl = view === 'map' ? '/explore?view=map' : '/explore';
      navigate(newUrl, { replace: true });
    }
  }, []); // Only run once on mount

  // Get filter state from URL
  const { apiParams, filterKey, filters, setSort } = useExploreFilters();

  // Unified data hook handles mobile (infinite scroll) vs desktop (pagination)
  const {
    locations, count, isLoading, isError, error,
    page, totalPages, setPage,
    hasNextPage, isFetchingNextPage, fetchNextPage,
    isDesktop,
  } = useExploreData(apiParams, filterKey);

  const { location: userLocation } = useUserLocation();

  // Trigger loading more when sentinel element comes into view
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const loadMoreRef = useIntersectionObserver(handleLoadMore);

  const handleToggleView = useCallback(() => {
    setView(prev => prev === 'list' ? 'map' : 'list');
    // Reset scroll position when switching views
    window.scrollTo(0, 0);
  }, []);

  const handlePressLocation = useCallback((location) => {
    navigate(`/locations/${location.id}`);
  }, [navigate]);

  // Handle page change (desktop pagination)
  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    // Scroll to top of list when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setPage]);

  // Save map viewport when it changes
  const handleMapViewportChange = useCallback((viewport) => {
    mapViewport.current = viewport;
  }, []);

  return (
    <div className={`explore-page ${view === 'map' && !isDesktop ? 'explore-page--map' : ''} ${isDesktop ? 'explore-page--desktop' : ''}`}>
      {/* List Panel - hidden only on mobile/tablet map view */}
      {/* Mobile: Virtualized list for performance with large datasets */}
      {!isDesktop && view === 'list' && (
        isLoading ? (
          <div className="explore-page__list">
            <div className="explore-page__loading">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <p>Loading locations...</p>
            </div>
          </div>
        ) : isError ? (
          <div className="explore-page__list">
            <div className="explore-page__error">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <p>Failed to load locations</p>
              <span className="explore-page__error-detail">
                {error?.message || 'Please try again later'}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="explore-page__mobile-header">
              <h2 className="explore-page__count">
                {count.toLocaleString()} {count === 1 ? 'location' : 'locations'} found
              </h2>
              <SortDropdown
                currentSort={filters.sort}
                onSortChange={setSort}
              />
            </div>
            {locations.length === 0 ? (
              <div className="explore-page__list">
                <div className="empty-state animate-fade-in-up">
                  <i className="fa-solid fa-map-location-dot empty-state__icon"></i>
                  <p className="empty-state__title">No locations found</p>
                  <p className="empty-state__description">Be the first to add a stargazing spot!</p>
                </div>
              </div>
            ) : (
              <VirtualizedLocationList
                locations={locations}
                userLocation={userLocation}
                onPressLocation={handlePressLocation}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
                loadMoreRef={loadMoreRef}
              />
            )}
          </>
        )
      )}

      {/* Desktop: Standard grid with pagination (only 10 items, no virtualization needed) */}
      <div className={`explore-page__list ${!isDesktop ? 'explore-page__list--hidden' : ''}`}>
        {/* Location count header - desktop only */}
        {isDesktop && !isLoading && !isError && (
          <div className="explore-page__header">
            <h2 className="explore-page__count">
              {count.toLocaleString()} {count === 1 ? 'location' : 'locations'} found
            </h2>
            <SortDropdown
              currentSort={filters.sort}
              onSortChange={setSort}
            />
          </div>
        )}

        {isDesktop && isLoading ? (
          <div className="explore-page__loading">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <p>Loading locations...</p>
          </div>
        ) : isDesktop && isError ? (
          <div className="explore-page__error">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <p>Failed to load locations</p>
            <span className="explore-page__error-detail">
              {error?.message || 'Please try again later'}
            </span>
          </div>
        ) : isDesktop && locations.length === 0 ? (
          <div className="empty-state animate-fade-in-up">
            <i className="fa-solid fa-map-location-dot empty-state__icon"></i>
            <p className="empty-state__title">No locations found</p>
            <p className="empty-state__description">Be the first to add a stargazing spot!</p>
          </div>
        ) : isDesktop && (
          <>
            {locations.map((location, index) => (
              <LocationCard
                key={location.id}
                location={location}
                userLocation={userLocation}
                onPress={handlePressLocation}
                style={{ '--card-index': index % 20 }}
              />
            ))}

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      {/* Map Panel - lazy loaded to defer Mapbox bundle, hidden only on mobile/tablet list view */}
      <div className={`explore-page__map ${!isDesktop && view !== 'map' ? 'explore-page__map--hidden' : ''}`}>
        <Suspense fallback={
          <div className="explore-page__loading">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <p>Loading map...</p>
          </div>
        }>
          <ExploreMap
            initialViewport={mapViewport.current}
            onViewportChange={handleMapViewportChange}
            initialLightPollution={initialLightPollutionRef.current}
            filters={apiParams}
          />
        </Suspense>
      </div>

      {/* Toggle button - mobile/tablet only */}
      {!isDesktop && <ViewToggle view={view} onToggle={handleToggleView} />}
    </div>
  );
}

export default ExplorePage;
