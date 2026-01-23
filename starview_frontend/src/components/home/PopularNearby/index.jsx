/**
 * PopularNearby Component
 *
 * Horizontal carousel section showing locations near user's actual location.
 * Uses actualLocation (stable IP/browser location) rather than search context.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../../../contexts/LocationContext';
import { usePopularNearby } from '../../../hooks/useLocations';
import LocationCard from '../../explore/LocationCard';
import './styles.css';

function PopularNearby({ userLocation, isLoading: isLocationLoading }) {
  const navigate = useNavigate();
  const { setLocation } = useLocation();

  const { data: locations, isLoading } = usePopularNearby(
    userLocation?.latitude,
    userLocation?.longitude
  );

  // Navigate to location detail page
  const handleLocationClick = useCallback(
    (location) => {
      navigate(`/locations/${location.id}`);
    },
    [navigate]
  );

  // Navigate to explore map centered on user's actual location
  const handleExploreClick = useCallback(
    (e) => {
      e.preventDefault();
      // Reset location context to actualLocation before navigating
      if (userLocation) {
        setLocation(userLocation.latitude, userLocation.longitude, userLocation.name, 'ip');
      }
      navigate('/explore?view=map&flyTo=true');
    },
    [userLocation, setLocation, navigate]
  );

  // Extract location name for header (e.g., "San Francisco" from "San Francisco, California")
  const locationName = userLocation?.name?.split(',')[0] || 'you';

  // Show loading skeleton while fetching location or data
  if (isLocationLoading || isLoading) {
    return (
      <section className="popular-nearby">
        <div className="popular-nearby__container">
          <header className="popular-nearby__header">
            <h2 className="popular-nearby__title">
              <span className="popular-nearby__title-text">Popular sites near </span>
              <span className="popular-nearby__title-location popular-nearby__title-location--loading">your location</span>
            </h2>
          </header>
          <div className="popular-nearby__carousel">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="popular-nearby__skeleton">
                <div className="popular-nearby__skeleton-image" />
                <div className="popular-nearby__skeleton-content">
                  <div className="popular-nearby__skeleton-title" />
                  <div className="popular-nearby__skeleton-meta" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Don't render if no locations found
  if (!locations?.length) {
    return null;
  }

  return (
    <section className="popular-nearby">
      <div className="popular-nearby__container">
        <header className="popular-nearby__header">
          <h2 className="popular-nearby__title">
            <span className="popular-nearby__title-text">Popular sites near </span>
            <a
              href="/explore?view=map&flyTo=true"
              className="popular-nearby__title-location"
              title={`Explore locations near ${userLocation?.name || 'your location'}`}
              onClick={handleExploreClick}
            >
              {locationName}
            </a>
          </h2>
        </header>
        <div className="popular-nearby__carousel">
          {locations.map((location) => (
            <div key={location.id} className="popular-nearby__card">
              <LocationCard
                location={location}
                userLocation={userLocation}
                onPress={handleLocationClick}
              />
            </div>
          ))}
          {/* See More card */}
          <a
            href="/explore?view=map&flyTo=true"
            className="popular-nearby__see-more"
            onClick={handleExploreClick}
          >
            <span className="popular-nearby__see-more-text">See more</span>
            <i className="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      </div>
    </section>
  );
}

export default PopularNearby;
