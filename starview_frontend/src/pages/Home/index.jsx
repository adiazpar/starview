/* Home Page
 * Landing page with cosmic elegance design.
 * Features animated hero, real platform stats, and feature highlights.
 */

import { Link } from 'react-router-dom';
import { usePlatformStats } from '../../hooks/useStats';
import { useAuth } from '../../context/AuthContext';
import './styles.css';

function HomePage() {
  const { stats, showStats } = usePlatformStats();
  const { isAuthenticated } = useAuth();

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
        </div>

        {/* Decorative glow */}
        <div className="hero__glow"></div>
      </section>

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
            <div className="feature-card">
              <div className="feature-card__icon">
                <i className="fa-solid fa-moon"></i>
              </div>
              <h3 className="feature-card__title">Conditions</h3>
              <p className="feature-card__text">
                Check weather forecasts, moon phases, and optimal viewing
                windows for any location.
              </p>
            </div>
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
