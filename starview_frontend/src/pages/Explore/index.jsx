/* Explore Page
 * Displays stargazing locations with map/list toggle.
 * Mobile-first design inspired by AllTrails UX patterns.
 */

import { useState, useCallback } from 'react';
import { useLocations } from '../../hooks/useLocations';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import LocationCard from '../../components/explore/LocationCard';
import ViewToggle from '../../components/explore/ViewToggle';
import './styles.css';

function ExplorePage() {
  const [view, setView] = useState('list');
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

  const handleToggleView = () => {
    setView(view === 'list' ? 'map' : 'list');
  };

  const handlePressLocation = (location) => {
    console.log('Navigate to location:', location.name);
    // TODO: Navigate to location detail page
  };

  return (
    <div className="explore-page">
      {view === 'list' ? (
        <div className="explore-page__list">
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
      ) : (
        <div className="explore-page__map">
          <div className="explore-page__map-placeholder">
            <i className="fa-solid fa-map"></i>
            <p>Map view coming soon</p>
          </div>
        </div>
      )}

      <ViewToggle view={view} onToggle={handleToggleView} />
    </div>
  );
}

export default ExplorePage;
