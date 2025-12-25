/* Explore Page
 * Displays stargazing locations with map/list toggle.
 * Mobile: infinite scroll, Desktop: pagination with sticky map.
 */

import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocations, useLocationsPaginated } from '../../hooks/useLocations';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import LocationCard from '../../components/explore/LocationCard';
import ViewToggle from '../../components/explore/ViewToggle';
import Pagination from '../../components/explore/Pagination';
import './styles.css';

// Lazy load ExploreMap - defers loading Mapbox GL JS (~500KB) until needed
const ExploreMap = lazy(() => import('../../components/explore/ExploreMap'));

function ExplorePage() {
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view') === 'map' ? 'map' : 'list';
  const [view, setView] = useState(initialView);
  const [page, setPage] = useState(1);
  const mapViewport = useRef(null); // Persist map position across view toggles
  const isDesktop = useIsDesktop();

  // Mobile: infinite scroll
  const infiniteQuery = useLocations({}, { enabled: !isDesktop });

  // Desktop: pagination
  const paginatedQuery = useLocationsPaginated({}, page, { enabled: isDesktop });

  // Use the appropriate data source based on device
  const {
    locations,
    count,
    isLoading,
    isError,
    error,
  } = isDesktop ? paginatedQuery : infiniteQuery;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = infiniteQuery;
  const { totalPages } = paginatedQuery;

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
  }, []);

  const handlePressLocation = useCallback((location) => {
    console.log('Navigate to location:', location.name);
    // TODO: Navigate to location detail page
  }, []);

  // Handle page change (desktop pagination)
  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    // Scroll to top of list when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Save map viewport when it changes
  const handleMapViewportChange = useCallback((viewport) => {
    mapViewport.current = viewport;
  }, []);

  return (
    <div className={`explore-page ${view === 'map' && !isDesktop ? 'explore-page--map' : ''} ${isDesktop ? 'explore-page--desktop' : ''}`}>
      {/* List Panel - hidden only on mobile/tablet map view */}
      <div className={`explore-page__list ${!isDesktop && view !== 'list' ? 'explore-page__list--hidden' : ''}`}>
        {/* Location count header - desktop only */}
        {isDesktop && !isLoading && locations.length > 0 && (
          <div className="explore-page__header">
            <h2 className="explore-page__count">
              {count.toLocaleString()} {count === 1 ? 'location' : 'locations'} found
            </h2>
          </div>
        )}

        {isLoading ? (
          <div className="explore-page__loading">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <p>Loading locations...</p>
          </div>
        ) : isError ? (
          <div className="explore-page__error">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <p>Failed to load locations</p>
            <span className="explore-page__error-detail">
              {error?.message || 'Please try again later'}
            </span>
          </div>
        ) : locations.length === 0 ? (
          <div className="empty-state animate-fade-in-up">
            <i className="fa-solid fa-map-location-dot empty-state__icon"></i>
            <p className="empty-state__title">No locations found</p>
            <p className="empty-state__description">Be the first to add a stargazing spot!</p>
          </div>
        ) : (
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

            {/* Desktop: Pagination */}
            {isDesktop && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}

            {/* Mobile: Infinite scroll sentinel */}
            {!isDesktop && (
              <div ref={loadMoreRef} className="explore-page__sentinel">
                {isFetchingNextPage && (
                  <div className="explore-page__loading-more">
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading more...</span>
                  </div>
                )}
              </div>
            )}
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
          />
        </Suspense>
      </div>

      {/* Toggle button - mobile/tablet only */}
      {!isDesktop && <ViewToggle view={view} onToggle={handleToggleView} />}
    </div>
  );
}

export default ExplorePage;
