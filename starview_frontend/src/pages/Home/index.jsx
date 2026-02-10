/* Home Page
 * Landing page with search-focused hero design.
 * Features location search bar and feature highlights.
 */

import { lazy, Suspense, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { useHeroCarousel } from '../../hooks/useHeroCarousel';
import { usePopularNearby } from '../../hooks/useLocations';
import ProfileSetupCard from '../../components/home/ProfileSetupCard';
import HeroCarousel from '../../components/home/HeroCarousel';
import PopularNearby from '../../components/home/PopularNearby';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

// Lazy load the heavy Mapbox Geocoder component
const LocationAutocomplete = lazy(() =>
  import('../../components/shared/LocationAutocomplete')
);

function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const { location, actualLocation, setLocation, isLoading: isLocationLoading } = useLocation();
  const { images: heroImages, isReady: isHeroReady } = useHeroCarousel();
  const { data: popularLocations, isLoading: isPopularLoading } = usePopularNearby(
    actualLocation?.latitude,
    actualLocation?.longitude
  );
  const navigate = useNavigate();

  // Handle location selection from search - updates context but stays on home
  const handleLocationSelect = useCallback((data) => {
    if (data.location && data.latitude && data.longitude) {
      setLocation(data.latitude, data.longitude, data.location, 'search');
    }
  }, [setLocation]);

  // Navigate to profile settings, optionally scrolling to a specific section
  const handleNavigateToSettings = useCallback((scrollTo) => {
    if (scrollTo) {
      navigate(`/profile?scrollTo=${scrollTo}`);
    } else {
      navigate('/profile');
    }
  }, [navigate]);

  // Unified loading state - wait for location, hero carousel, AND popular nearby before rendering
  const isPageLoading = isLocationLoading || !isHeroReady || isPopularLoading;

  if (isPageLoading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  return (
    <main className="home">
      {/* Hero Section */}
      <section className="hero">
        <HeroCarousel images={heroImages} />
        <div className="hero__container">
          {/* Headline */}
          <h1 className="hero__title">
            Discover Your Perfect
            <span className="hero__title-accent"> Stargazing Spot</span>
          </h1>
        </div>

        {/* Search Bar - Primary focal point */}
        <div className="hero__search-container">
          <div className="hero__search">
            <Suspense
              fallback={
                <div className="hero__search-loading">
                  <LoadingSpinner size="xs" inline />
                  <span>Loading...</span>
                </div>
              }
            >
              <LocationAutocomplete
                onSelect={handleLocationSelect}
                placeholder={`Search near ${location?.name?.split(',')[0] || 'you'}`}
              />
            </Suspense>
            <button
              type="button"
              className="hero__search-btn"
              onClick={() => navigate('/explore?view=map&flyTo=true')}
              aria-label="Explore map"
            >
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
          </div>

          {/* Explore link */}
          <Link to="/explore" className="hero__explore-link">
            Explore nearby locations
          </Link>
        </div>

        {/* Decorative glow */}
        <div className="hero__glow"></div>
      </section>

      {/* Popular Nearby Section */}
      <PopularNearby userLocation={actualLocation} locations={popularLocations} />

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
            <span className="section-accent">Features</span>
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
            <Link to="/explore?view=map" className="feature-card feature-card--link">
              <div className="feature-card__icon">
                <i className="fa-solid fa-location-dot"></i>
              </div>
              <h3 className="feature-card__title">Interactive Map</h3>
              <p className="feature-card__text">
                Browse locations on an interactive map with light pollution
                overlays and detailed information.
              </p>
              <span className="feature-card__cta">
                Explore map <i className="fa-solid fa-arrow-right"></i>
              </span>
            </Link>

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
            <span className="section-accent section-accent--light section-accent--centered">Get Started</span>
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
