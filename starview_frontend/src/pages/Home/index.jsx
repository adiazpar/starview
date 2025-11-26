/* Home Page
 * Landing page with cosmic elegance design.
 * Features animated hero, stat badges, and feature highlights.
 */

import { Link } from 'react-router-dom';
import './styles.css';

function HomePage() {
  return (
    <main className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__container">
          {/* Badge */}
          <div className="hero__badge">
            <span className="hero__badge-icon">
              <i className="fa-solid fa-sparkles"></i>
            </span>
            <span className="hero__badge-text">Find the darkest skies</span>
          </div>

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
            <Link to="/map" className="hero__btn hero__btn--primary">
              <i className="fa-solid fa-map"></i>
              Explore Map
            </Link>
            <Link to="/register" className="hero__btn hero__btn--secondary">
              Create Account
              <i className="fa-solid fa-arrow-right"></i>
            </Link>
          </div>

          {/* Stats */}
          <div className="hero__stats">
            <div className="hero__stat">
              <span className="hero__stat-value">2.4k+</span>
              <span className="hero__stat-label">Locations</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-value">12k+</span>
              <span className="hero__stat-label">Reviews</span>
            </div>
            <div className="hero__stat-divider"></div>
            <div className="hero__stat">
              <span className="hero__stat-value">8.5k+</span>
              <span className="hero__stat-label">Stargazers</span>
            </div>
          </div>
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
              Join thousands of stargazers finding the perfect night sky.
            </p>
            <Link to="/register" className="cta__btn">
              Get Started Free
              <i className="fa-solid fa-arrow-right"></i>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default HomePage;
