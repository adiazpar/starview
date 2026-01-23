/* Home Page
 * Landing page with cosmic elegance design.
 * Features animated hero, real platform stats, and feature highlights.
 */

import { lazy, Suspense, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlatformStats } from '../../hooks/useStats';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import ProfileSetupCard from '../../components/home/ProfileSetupCard';
import './styles.css';

// Lazy load the heavy Mapbox Geocoder component
const LocationAutocomplete = lazy(() =>
  import('../../components/shared/LocationAutocomplete')
);

function HomePage() {
  const { stats, showStats } = usePlatformStats();
  const { isAuthenticated, user } = useAuth();
  const { location, setLocation, isLoading: isLocationLoading } = useLocation();
  const navigate = useNavigate();

  // Navigate to profile settings, optionally scrolling to a specific section
  const handleNavigateToSettings = (scrollTo) => {
    if (scrollTo) {
      navigate(`/profile?scrollTo=${scrollTo}`);
    } else {
      navigate('/profile');
    }
  };

  // Handle location selection from search - updates context but stays on home
  const handleLocationSelect = useCallback((data) => {
    if (data.location && data.latitude && data.longitude) {
      setLocation(data.latitude, data.longitude, data.location, 'search');
      // Stay on home - the CTAs will take user to pages with the updated location
    }
  }, [setLocation]);

  return (
    <main className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__container">
          {/* Headline */}
          <h1 className="hero__title">
            Discover Your Perfect
            <span className="hero__title-accent"> Stargazing Spot</span>
          </h1>

          {/* Subheadline */}
          <p className="hero__subtitle">
            Join a community of astronomers sharing the best locations
            for observing the night sky. Rate, review, and explore.
          </p>

          {/* CTA Buttons */}
          <div className="hero__actions">
            <Link to="/explore?view=map" className="btn-primary">
              <i className="fa-solid fa-map"></i>
              Explore Map
            </Link>
            <Link to={isAuthenticated ? '/explore' : '/register'} className="btn-secondary">
              {isAuthenticated ? 'Browse Locations' : 'Create Account'}
              <i className="fa-solid fa-arrow-right"></i>
            </Link>
          </div>

          {/* Stats - only shown if above threshold */}
          {showStats && stats ? (
            <div className="hero__stats">
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.locations.formatted}</span>
                <span className="hero__stat-label">Locations</span>
              </div>
              <div className="hero__stat-divider"></div>
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.reviews.formatted}</span>
                <span className="hero__stat-label">Reviews</span>
              </div>
              <div className="hero__stat-divider"></div>
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.stargazers.formatted}</span>
                <span className="hero__stat-label">Stargazers</span>
              </div>
            </div>
          ) : (
            <p className="hero__community-note">
              Your stargazing adventure begins here
            </p>
          )}

          {/* Location Search - Always visible, pre-filled with current location */}
          <div className="hero__search hero__search--always-visible">
            <div className="hero__search-label">
              <i className="fa-solid fa-location-dot"></i>
              <span>Showing conditions for</span>
            </div>
            <div className="hero__search-input">
              <Suspense
                fallback={
                  <div className="hero__search-loading">
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading search...</span>
                  </div>
                }
              >
                <LocationAutocomplete
                  onSelect={handleLocationSelect}
                  placeholder={isLocationLoading ? 'Finding your location...' : (location?.name || 'Search for a city...')}
                />
              </Suspense>
            </div>
            {location && !isLocationLoading && (
              <div className="hero__search-current">
                <i className="fa-solid fa-check-circle"></i>
                <span>{location.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Decorative glow */}
        <div className="hero__glow"></div>
      </section>

      {/* Profile setup card for authenticated users */}
      {isAuthenticated && user && (
        <ProfileSetupCard
          user={user}
          onNavigateToSettings={handleNavigateToSettings}
        />
      )}

      {/* Features Section */}
      <section className="features">
        <div className="features__container">
          <div className="features__header">
            <span className="features__label">Features</span>
            <h2 className="features__title">Everything you need to find dark skies</h2>
          </div>

          <div className="features__grid">
            {/* Feature 1 */}
            <div className="feature-card">
              <div className="feature-card__icon">
                <i className="fa-solid fa-star"></i>
              </div>
              <h3 className="feature-card__title">Rate Locations</h3>
              <p className="feature-card__text">
                Share your experiences with detailed ratings for sky darkness,
                accessibility, and viewing conditions.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="feature-card">
              <div className="feature-card__icon">
                <i className="fa-solid fa-location-dot"></i>
              </div>
              <h3 className="feature-card__title">Interactive Map</h3>
              <p className="feature-card__text">
                Browse locations on an interactive map with light pollution
                overlays and detailed information.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="feature-card">
              <div className="feature-card__icon">
                <i className="fa-solid fa-users"></i>
              </div>
              <h3 className="feature-card__title">Community</h3>
              <p className="feature-card__text">
                Connect with fellow astronomers, share tips, and discover
                hidden gems from experienced stargazers.
              </p>
            </div>

            {/* Feature 4 */}
            <Link to="/sky" className="feature-card feature-card--link">
              <div className="feature-card__icon">
                <i className="fa-solid fa-moon"></i>
              </div>
              <h3 className="feature-card__title">Conditions</h3>
              <p className="feature-card__text">
                Check weather forecasts, moon phases, and optimal viewing
                windows for any location.
              </p>
              <span className="feature-card__cta">
                See full forecast <i className="fa-solid fa-arrow-right"></i>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta__container">
          <div className="cta__content">
            <h2 className="cta__title">Ready to explore the cosmos?</h2>
            <p className="cta__text">
              {isAuthenticated
                ? 'Discover new stargazing locations near you.'
                : 'Join thousands of stargazers finding the perfect night sky.'}
            </p>
            <Link to={isAuthenticated ? '/explore' : '/register'} className="btn-primary">
              {isAuthenticated ? 'Get Started' : 'Get Started'}
              <i className="fa-solid fa-arrow-right"></i>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default HomePage;
