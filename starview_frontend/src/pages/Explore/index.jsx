/* Explore Page
 * Displays stargazing locations with map/list toggle.
 * Mobile-first design inspired by AllTrails UX patterns.
 */

import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useLocations } from '../../hooks/useLocations';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import LocationCard from '../../components/explore/LocationCard';
import ViewToggle from '../../components/explore/ViewToggle';
import './styles.css';

// Lazy load ExploreMap - defers loading Mapbox GL JS (~500KB) until needed
const ExploreMap = lazy(() => import('../../components/explore/ExploreMap'));

function ExplorePage() {
  const [view, setView] = useState('list');
  const mapViewport = useRef(null); // Persist map position across view toggles
  const {
    locations,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useLocations();
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

  // Save map viewport when it changes
  const handleMapViewportChange = useCallback((viewport) => {
    mapViewport.current = viewport;
  }, []);

  return (
    <div className={`explore-page ${view === 'map' ? 'explore-page--map' : ''}`}>
      {/* List View - hidden when map is active */}
      <div className={`explore-page__list ${view !== 'list' ? 'explore-page__list--hidden' : ''}`}>
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
          <div className="explore-page__empty">
            <i className="fa-solid fa-map-location-dot"></i>
            <p>No locations found</p>
            <span>Be the first to add a stargazing spot!</span>
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

            {/* Sentinel element for infinite scroll */}
            <div ref={loadMoreRef} className="explore-page__sentinel">
              {isFetchingNextPage && (
                <div className="explore-page__loading-more">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Loading more...</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Map View - lazy loaded to defer Mapbox bundle, hidden when list is active */}
      <div className={`explore-page__map ${view !== 'map' ? 'explore-page__map--hidden' : ''}`}>
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

      <ViewToggle view={view} onToggle={handleToggleView} />
    </div>
  );
}

export default ExplorePage;
