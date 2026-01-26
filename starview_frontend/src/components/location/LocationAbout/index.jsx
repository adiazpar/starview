/* LocationAbout Component
 * Displays location description with optional website link.
 * Expandable content for long descriptions.
 */

import { useState, useRef, useEffect } from 'react';
import './styles.css';

function LocationAbout({ location }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const descriptionRef = useRef(null);

  // Check if description needs "show more" button
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseInt(window.getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 4; // 4 lines
      setNeedsExpansion(descriptionRef.current.scrollHeight > maxHeight);
    }
  }, [location.description]);

  const metadata = location.type_metadata || {};
  const websiteUrl = metadata.website || metadata.reservation_url;

  return (
    <div className="location-about">
      {/* Description */}
      {location.description ? (
        <div className="location-about__description-wrapper">
          <p
            ref={descriptionRef}
            className={`location-about__description ${!isExpanded && needsExpansion ? 'location-about__description--truncated' : ''}`}
          >
            {location.description}
          </p>
          {needsExpansion && (
            <button
              className="location-about__toggle"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p className="location-about__description location-about__description--empty">
          No description available for this location.
        </p>
      )}

      {/* Website link */}
      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="location-about__website"
        >
          {new URL(websiteUrl).hostname.replace('www.', '')}
          <i className="fa-solid fa-external-link"></i>
        </a>
      )}
    </div>
  );
}

export default LocationAbout;
