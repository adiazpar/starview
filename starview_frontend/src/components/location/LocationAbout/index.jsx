/* LocationAbout Component
 * Displays location description and type-specific metadata.
 * Expandable content for long descriptions.
 */

import { useState, useRef, useEffect } from 'react';
import './styles.css';

// Type-specific field configurations
const TYPE_FIELDS = {
  observatory: {
    icon: 'fa-solid fa-telescope',
    label: 'Observatory Info',
    fields: [
      { key: 'phone', icon: 'fa-solid fa-phone', label: 'Phone' },
      { key: 'website', icon: 'fa-solid fa-globe', label: 'Website', isLink: true },
      { key: 'hours', icon: 'fa-solid fa-clock', label: 'Hours' },
      { key: 'admission_fee', icon: 'fa-solid fa-ticket', label: 'Admission' },
    ],
  },
  campground: {
    icon: 'fa-solid fa-campground',
    label: 'Campground Details',
    fields: [
      { key: 'amenities', icon: 'fa-solid fa-list', label: 'Amenities' },
      { key: 'reservation_url', icon: 'fa-solid fa-calendar', label: 'Reservations', isLink: true },
      { key: 'fee', icon: 'fa-solid fa-dollar-sign', label: 'Fee' },
    ],
  },
  dark_sky_site: {
    icon: 'fa-solid fa-moon',
    label: 'Dark Sky Certification',
    fields: [
      { key: 'certification', icon: 'fa-solid fa-certificate', label: 'Certification' },
      { key: 'best_season', icon: 'fa-solid fa-calendar-days', label: 'Best Season' },
    ],
  },
  park: {
    icon: 'fa-solid fa-tree',
    label: 'Park Details',
    fields: [
      { key: 'hours', icon: 'fa-solid fa-clock', label: 'Hours' },
      { key: 'fee', icon: 'fa-solid fa-dollar-sign', label: 'Entry Fee' },
    ],
  },
};

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

  const typeConfig = TYPE_FIELDS[location.location_type];
  const metadata = location.type_metadata || {};

  // Filter to only show fields that have values
  const availableFields = typeConfig?.fields.filter(
    (field) => metadata[field.key]
  ) || [];

  return (
    <section className="location-about glass-card">
      <div className="location-about__header">
        <span>About this Location</span>
      </div>

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

      {/* Type-specific metadata */}
      {typeConfig && availableFields.length > 0 && (
        <div className="location-about__metadata glass-card">
          <h3 className="location-about__metadata-header">
            <i className={typeConfig.icon}></i>
            {typeConfig.label}
          </h3>
          <dl className="location-about__metadata-list">
            {availableFields.map((field) => (
              <div key={field.key} className="location-about__metadata-item">
                <dt className="location-about__metadata-label">
                  <i className={field.icon}></i>
                  {field.label}
                </dt>
                <dd className="location-about__metadata-value">
                  {field.isLink ? (
                    <a
                      href={metadata[field.key]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {field.key === 'website'
                        ? new URL(metadata[field.key]).hostname.replace('www.', '')
                        : 'Book Now'}
                      <i className="fa-solid fa-external-link"></i>
                    </a>
                  ) : (
                    metadata[field.key]
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Address */}
      {location.formatted_address && (
        <div className="location-about__address">
          <i className="fa-solid fa-location-dot"></i>
          <span>{location.formatted_address}</span>
        </div>
      )}
    </section>
  );
}

export default LocationAbout;
