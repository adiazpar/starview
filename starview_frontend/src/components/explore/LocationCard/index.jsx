/* LocationCard Component
 * Displays a stargazing location with image, bortle score, rating, and distance.
 * Mobile-first card design inspired by AllTrails.
 */

import { useState } from 'react';
import './styles.css';

// Convert Bortle class (1-9) to score out of 10
// Lower Bortle = darker skies = higher score
function bortleToScore(bortle) {
  return Math.round((10 - bortle) * 10 / 9 * 10) / 10;
}

// Get color class based on Bortle score
function getBortleColorClass(score) {
  if (score >= 8) return 'bortle--excellent';  // Dark green
  if (score >= 6) return 'bortle--good';       // Green
  if (score >= 4) return 'bortle--moderate';   // Yellow
  if (score >= 2) return 'bortle--poor';       // Orange
  return 'bortle--bad';                         // Red
}

function LocationCard({ location, onSave, onPress }) {
  const [isSaved, setIsSaved] = useState(location.isSaved || false);

  const bortleScore = bortleToScore(location.bortleClass);
  const bortleColor = getBortleColorClass(bortleScore);

  const handleSave = (e) => {
    e.stopPropagation();
    setIsSaved(!isSaved);
    onSave?.(location.id, !isSaved);
  };

  return (
    <article className="location-card glass-card glass-card--interactive" onClick={() => onPress?.(location)}>
      {/* Hero Image */}
      <div className="location-card__image-container">
        <img
          src={location.image}
          alt={location.name}
          className="location-card__image"
          loading="lazy"
        />
        <button
          className={`location-card__save ${isSaved ? 'location-card__save--active' : ''}`}
          onClick={handleSave}
          aria-label={isSaved ? 'Remove from saved' : 'Save location'}
        >
          <i className={`fa-${isSaved ? 'solid' : 'regular'} fa-heart`}></i>
        </button>
      </div>

      {/* Card Content */}
      <div className="location-card__content">
        <div className="location-card__header">
          <h3 className="location-card__name">{location.name}</h3>
          <span className="location-card__region">{location.region}</span>
        </div>

        <div className="location-card__meta">
          {/* Bortle Score */}
          <div className={`location-card__bortle ${bortleColor}`}>
            <i className="fa-solid fa-moon"></i>
            <span>{bortleScore.toFixed(1)}/10</span>
          </div>

          {/* Star Rating */}
          <div className="location-card__rating">
            <i className="fa-solid fa-star"></i>
            <span>{location.rating.toFixed(1)}</span>
            <span className="location-card__reviews">({location.reviewCount})</span>
          </div>

          {/* Distance */}
          <div className="location-card__distance">
            <i className="fa-solid fa-location-dot"></i>
            <span>{location.distance}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default LocationCard;
