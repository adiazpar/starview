import { Link } from 'react-router-dom';
import './styles.css';

function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <div className="page-container home-hero">
        <h1 className="home-hero-title">
          Discover the Perfect
          <span className="home-hero-title-accent">
            Stargazing Spots
          </span>
        </h1>
        <p className="home-hero-text">
          Find and review the best locations for observing the night sky.
          Share your experiences with fellow astronomy enthusiasts.
        </p>
        <div className="home-hero-buttons">
          <Link to="/map" className="btn btn-lg">
            <i className="fa-solid fa-map"></i>
            Explore Map
          </Link>
          <Link to="/register" className="btn btn-lg">
            <i className="fa-solid fa-user-plus"></i>
            Get Started
          </Link>
        </div>
      </div>

      {/* Features Section */}
      <div className="page-container home-features">
        <div className="home-features-grid">
          <div className="card">
            <i className="fa-solid fa-star home-feature-icon"></i>
            <h3 className="card-title">Rate Locations</h3>
            <p className="card-body">
              Share your experiences and help others find the best stargazing spots.
            </p>
          </div>
          <div className="card">
            <i className="fa-solid fa-map-location-dot home-feature-icon"></i>
            <h3 className="card-title">Interactive Map</h3>
            <p className="card-body">
              Browse locations on an interactive map with detailed information.
            </p>
          </div>
          <div className="card">
            <i className="fa-solid fa-comments home-feature-icon"></i>
            <h3 className="card-title">Community Reviews</h3>
            <p className="card-body">
              Read reviews and tips from experienced stargazers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
