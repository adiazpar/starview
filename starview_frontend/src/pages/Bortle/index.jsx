/* Bortle Scale Educational Page
 * Explains the Bortle Dark-Sky Scale for stargazers.
 * Observatory-style design matching the Sky page aesthetic.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import { useLocation } from '../../contexts/LocationContext';
import { useBortle } from '../../hooks/useBortle';
import BortleSkySlider from '../../components/shared/BortleSkySlider';
import LocationChip from '../../components/shared/LocationChip';
import LocationModal from '../../components/shared/LocationModal';
import './styles.css';

/**
 * Bortle class data with descriptions and visibility info
 */
const BORTLE_DATA = [
  {
    class: 1,
    name: 'Excellent Dark Site',
    description: 'The zodiacal light, gegenschein, and zodiacal band are all visible. The Milky Way casts obvious shadows on the ground.',
    visibility: [
      { text: 'Zodiacal light spans entire sky', icon: 'check' },
      { text: 'Airglow visible near horizon', icon: 'check' },
      { text: 'Scorpius/Sagittarius richly detailed', icon: 'check' },
      { text: 'Faintest stars magnitude 7.6-8.0', icon: 'check' },
    ],
    locations: 'Remote wilderness, dark sky preserves',
  },
  {
    class: 2,
    name: 'Truly Dark Site',
    description: 'Airglow may be weakly visible near horizon. The summer Milky Way is highly structured with obvious dark lanes.',
    visibility: [
      { text: 'Zodiacal light yellowish, may cast shadows', icon: 'check' },
      { text: 'M31 extends visibly', icon: 'check' },
      { text: 'Many Messier globulars naked-eye', icon: 'check' },
      { text: 'Faintest stars magnitude 7.1-7.5', icon: 'check' },
    ],
    locations: 'Rural areas far from cities',
  },
  {
    class: 3,
    name: 'Rural Sky',
    description: 'Some light pollution evident at the horizon. The Milky Way still appears complex with dark lanes visible.',
    visibility: [
      { text: 'Milky Way complex and striking', icon: 'check' },
      { text: 'Some globular clusters naked-eye', icon: 'check' },
      { text: 'Zodiacal light obvious in spring/autumn', icon: 'check' },
      { text: 'Faintest stars magnitude 6.6-7.0', icon: 'check' },
    ],
    locations: 'Rural countryside, small villages',
  },
  {
    class: 4,
    name: 'Rural/Suburban Transition',
    description: 'Light pollution domes visible over population centers. The Milky Way is obvious but lacks fine detail.',
    visibility: [
      { text: 'Milky Way impressive but washed', icon: 'check' },
      { text: 'M31 easily visible', icon: 'check' },
      { text: 'Zodiacal light weak', icon: 'minus' },
      { text: 'Faintest stars magnitude 6.1-6.5', icon: 'check' },
    ],
    locations: 'Outskirts of small towns',
  },
  {
    class: 5,
    name: 'Suburban Sky',
    description: 'Only hints of zodiacal light on the best nights. The Milky Way is very weak or invisible near the horizon, washed out overhead.',
    visibility: [
      { text: 'Milky Way faint overhead only', icon: 'minus' },
      { text: 'M31 visible with averted vision', icon: 'check' },
      { text: 'Clouds brighter than sky background', icon: 'xmark' },
      { text: 'Faintest stars magnitude 5.6-6.0', icon: 'minus' },
    ],
    locations: 'Outer suburbs, dark parks',
  },
  {
    class: 6,
    name: 'Bright Suburban Sky',
    description: 'Zodiacal light is invisible. The Milky Way is barely detectable near the zenith, if at all.',
    visibility: [
      { text: 'Planets clearly visible', icon: 'check' },
      { text: 'Major constellations recognizable', icon: 'check' },
      { text: 'Milky Way marginal at best', icon: 'xmark' },
      { text: 'Deep-sky objects require telescope', icon: 'minus' },
    ],
    locations: 'Typical suburban neighborhoods',
  },
  {
    class: 7,
    name: 'Suburban/Urban Transition',
    description: 'The entire sky has a vague grayish-white hue. The Milky Way is completely invisible.',
    visibility: [
      { text: 'Planets and Moon excellent', icon: 'check' },
      { text: 'Bright stars visible', icon: 'check' },
      { text: 'Milky Way invisible', icon: 'xmark' },
      { text: 'Some constellations incomplete', icon: 'minus' },
    ],
    locations: 'Dense suburbs, urban edges',
  },
  {
    class: 8,
    name: 'City Sky',
    description: 'The sky glows white or orange. Familiar constellations are incomplete or unrecognizable.',
    visibility: [
      { text: 'Moon and planets are highlights', icon: 'check' },
      { text: 'Brightest stars visible', icon: 'check' },
      { text: 'Many constellation stars missing', icon: 'xmark' },
      { text: 'No deep-sky objects', icon: 'xmark' },
    ],
    locations: 'Cities, commercial districts',
  },
  {
    class: 9,
    name: 'Inner-City Sky',
    description: 'The entire sky is brightly lit. Only the Moon, planets, and a few bright stars are visible.',
    visibility: [
      { text: 'Moon viewing still rewarding', icon: 'check' },
      { text: 'Planets visible when up', icon: 'check' },
      { text: 'Only ~20 stars visible', icon: 'xmark' },
      { text: 'Most constellations invisible', icon: 'xmark' },
    ],
    locations: 'Downtown areas, major cities',
  },
];

/**
 * Format current date for display
 */
const formatDate = () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
};

function BortlePage() {
  const featuresRef = useRef([]);
  const bottomCtaRef = useRef(null);
  const [hoveredClass, setHoveredClass] = useState(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Live data hooks
  const { location, source: locationSource } = useLocation();
  const lat = location?.latitude;
  const lng = location?.longitude;
  const hasLocation = lat !== undefined && lng !== undefined;

  const { bortle: userBortle } = useBortle({
    lat,
    lng,
    enabled: hasLocation,
  });

  // Memoized display values
  const displayData = useMemo(() => ({
    bortle: userBortle,
    date: formatDate(),
    locationLabel: locationSource === 'browser' ? 'GPS' : locationSource === 'ip' ? 'APPROX' : locationSource === 'search' ? 'SEARCH' : null,
  }), [userBortle, locationSource]);

  // Get user's bortle class data
  const userBortleData = userBortle ? BORTLE_DATA.find(b => b.class === userBortle) : null;

  // Displayed class: hover > user's class > default to class 1
  const displayedClass = hoveredClass || userBortle || 1;
  const displayedData = BORTLE_DATA[displayedClass - 1];

  // Scroll-triggered animations using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains('bortle-bottom')) {
              entry.target.classList.add('bortle-bottom--visible');
            } else {
              entry.target.classList.add('bortle-section--visible');
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    // Only observe elements that aren't already visible
    featuresRef.current.forEach((el) => {
      if (el && !el.classList.contains('bortle-section--visible')) {
        observer.observe(el);
      }
    });

    if (bottomCtaRef.current && !bottomCtaRef.current.classList.contains('bortle-bottom--visible')) {
      observer.observe(bottomCtaRef.current);
    }

    return () => observer.disconnect();
  }, [userBortleData]);

  useSEO({
    title: 'Understanding the Bortle Scale | Starview',
    description: 'Learn about the Bortle Dark-Sky Scale, a nine-level numeric scale that measures night sky brightness. Understand what you can see at each level and find darker skies.',
    path: '/bortle',
  });

  return (
    <div className="bortle-page">
      {/* Location Modal */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
      />

      {/* Observatory-Style Hero Section */}
      <header className="bortle-hero">
        {/* Grid overlay */}
        <div className="bortle-hero__grid" aria-hidden="true" />

        {/* Scan line effect */}
        <div className="bortle-hero__scanline" aria-hidden="true" />

        {/* Corner brackets */}
        <svg className="bortle-hero__bracket bortle-hero__bracket--tl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 40 L0 0 L40 0" fill="none" strokeWidth="2" />
        </svg>
        <svg className="bortle-hero__bracket bortle-hero__bracket--tr" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L40 0 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="bortle-hero__bracket bortle-hero__bracket--bl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L0 40 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="bortle-hero__bracket bortle-hero__bracket--br" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M40 0 L40 40 L0 40" fill="none" strokeWidth="2" />
        </svg>

        {/* Status bar (top) */}
        <div className="bortle-hero__status-bar">
          <div className="bortle-hero__status">
            <span className="bortle-hero__status-dot" />
            <span className="bortle-hero__status-text">REFERENCE</span>
          </div>
          <span className="bortle-hero__status-label">LIGHT POLLUTION</span>
          <span className="bortle-hero__status-date">{displayData.date}</span>
        </div>

        {/* Main content */}
        <div className="bortle-hero__content">
          <h1 className="bortle-hero__title">
            The Bortle Scale
          </h1>
          <p className="bortle-hero__text">
            A nine-level numeric scale measuring the night sky's brightness at a given location.
            Created by amateur astronomer John E. Bortle in 2001.
          </p>
          <div className="bortle-hero__location">
            <LocationChip onClick={() => setIsLocationModalOpen(true)} />
          </div>
        </div>

        {/* User's current Bortle (bottom) */}
        <div className="bortle-hero__data-strip">
          {displayData.bortle ? (
            <div className="bortle-hero__data-item bortle-hero__data-item--highlight">
              <span className="bortle-hero__data-label">YOUR SKY</span>
              <span className="bortle-hero__data-value bortle-hero__data-value--large">
                CLASS {displayData.bortle}
              </span>
              {displayData.locationLabel && (
                <span className="bortle-hero__data-source">{displayData.locationLabel}</span>
              )}
            </div>
          ) : (
            <div className="bortle-hero__data-item bortle-hero__data-item--empty">
              <span className="bortle-hero__data-label">YOUR SKY</span>
              <span className="bortle-hero__data-value">Enable location to see</span>
            </div>
          )}
        </div>
      </header>

      {/* Interactive Scale Section */}
      <section className="bortle-section bortle-scale-section" ref={(el) => (featuresRef.current[0] = el)}>
        <div className="bortle-section__header">
          <span className="bortle-section__eyebrow">Interactive Guide</span>
          <h2 className="bortle-section__title">Explore Each Class</h2>
          <p className="bortle-section__subtitle">
            Tap or hover on a class to learn what you can expect to see
          </p>
        </div>

        <div className="bortle-scale">
          <div className="bortle-scale__bars">
            {BORTLE_DATA.map((data, index) => (
              <div
                key={data.class}
                className={`bortle-scale__bar bortle-scale__bar--${data.class} ${
                  displayedClass === data.class ? 'bortle-scale__bar--selected' : ''
                } ${userBortle === data.class ? 'bortle-scale__bar--user' : ''}`}
                onMouseEnter={() => setHoveredClass(data.class)}
                onMouseLeave={() => setHoveredClass(null)}
                role="button"
                tabIndex={0}
                aria-label={`Bortle class ${data.class}: ${data.name}`}
                style={{ '--bar-delay': `${0.05 * index}s` }}
              >
                <span className="bortle-scale__bar-number">{data.class}</span>
                {userBortle === data.class && (
                  <span className="bortle-scale__bar-marker">YOU</span>
                )}
              </div>
            ))}
          </div>

          <div className="bortle-scale__labels">
            <span>Darkest</span>
            <span>Brightest</span>
          </div>

          {/* Info panel - always visible */}
          <div className="bortle-scale__info bortle-scale__info--visible">
            <div className="bortle-scale__info-header">
              <span className="bortle-scale__info-class">Class {displayedData.class}</span>
              <h3 className="bortle-scale__info-name">{displayedData.name}</h3>
            </div>
            <p className="bortle-scale__info-desc">{displayedData.description}</p>
            <div className="bortle-scale__info-location">
              <i className="fa-solid fa-location-dot" />
              <span>{displayedData.locations}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sky Comparison Slider Section */}
      <section className="bortle-section bortle-slider-section" ref={(el) => (featuresRef.current[4] = el)}>
        <div className="bortle-section__header">
          <span className="bortle-section__eyebrow">Visual Comparison</span>
          <h2 className="bortle-section__title">See the Difference</h2>
          <p className="bortle-section__subtitle">
            Drag the slider to see how light pollution affects night sky visibility
          </p>
        </div>

        <BortleSkySlider />
      </section>

      {/* What Can You See Section */}
      <section className="bortle-section bortle-visibility-section" ref={(el) => (featuresRef.current[1] = el)}>
        <div className="bortle-section__header">
          <span className="bortle-section__eyebrow">Visibility Guide</span>
          <h2 className="bortle-section__title">What Can You See?</h2>
          <p className="bortle-section__subtitle">
            Your sky quality determines which celestial objects are visible
          </p>
        </div>

        <div className="bortle-visibility">
          <div className="bortle-visibility__tier bortle-visibility__tier--excellent">
            <div className="bortle-visibility__tier-header">
              <div className="bortle-visibility__tier-badge">1-2</div>
              <h3 className="bortle-visibility__tier-title">Pristine Dark Skies</h3>
            </div>
            <ul className="bortle-visibility__list">
              <li><i className="fa-solid fa-check" />Zodiacal light and gegenschein</li>
              <li><i className="fa-solid fa-check" />Milky Way structure and dust lanes</li>
              <li><i className="fa-solid fa-check" />Faint galaxies with keen eyesight</li>
              <li><i className="fa-solid fa-check" />All Messier objects</li>
            </ul>
          </div>

          <div className="bortle-visibility__tier bortle-visibility__tier--good">
            <div className="bortle-visibility__tier-header">
              <div className="bortle-visibility__tier-badge">3-4</div>
              <h3 className="bortle-visibility__tier-title">Rural Skies</h3>
            </div>
            <ul className="bortle-visibility__list">
              <li><i className="fa-solid fa-check" />Clear Milky Way arch</li>
              <li><i className="fa-solid fa-check" />Bright nebulae and clusters</li>
              <li><i className="fa-solid fa-check" />Andromeda Galaxy easily</li>
              <li><i className="fa-solid fa-check" />Many globular clusters</li>
            </ul>
          </div>

          <div className="bortle-visibility__tier bortle-visibility__tier--moderate">
            <div className="bortle-visibility__tier-header">
              <div className="bortle-visibility__tier-badge">5-6</div>
              <h3 className="bortle-visibility__tier-title">Suburban Skies</h3>
            </div>
            <ul className="bortle-visibility__list">
              <li><i className="fa-solid fa-minus" />Milky Way faint or invisible</li>
              <li><i className="fa-solid fa-check" />Bright stars and planets</li>
              <li><i className="fa-solid fa-check" />Major constellations</li>
              <li><i className="fa-solid fa-xmark" />Deep-sky objects very difficult</li>
            </ul>
          </div>

          <div className="bortle-visibility__tier bortle-visibility__tier--poor">
            <div className="bortle-visibility__tier-header">
              <div className="bortle-visibility__tier-badge">7-9</div>
              <h3 className="bortle-visibility__tier-title">Urban Skies</h3>
            </div>
            <ul className="bortle-visibility__list">
              <li><i className="fa-solid fa-check" />Moon and planets</li>
              <li><i className="fa-solid fa-check" />Brightest stars only</li>
              <li><i className="fa-solid fa-xmark" />No Milky Way</li>
              <li><i className="fa-solid fa-xmark" />Most deep-sky invisible</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Tips Section */}
      <section className="bortle-section bortle-tips-section" ref={(el) => (featuresRef.current[2] = el)}>
        <div className="bortle-section__header">
          <span className="bortle-section__eyebrow">Practical Advice</span>
          <h2 className="bortle-section__title">Making the Most of Your Sky</h2>
        </div>

        <div className="bortle-tips">
          {/* Hero card - spans 2 rows */}
          <div className="bortle-tips__card bortle-tips__card--hero">
            <div className="bortle-tips__icon bortle-tips__icon--large">
              <i className="fa-solid fa-car" />
            </div>
            <h3 className="bortle-tips__title">Travel to Darker Sites</h3>
            <p className="bortle-tips__text">
              Even a 30-minute drive from urban areas can improve your Bortle class by 2-3 levels.
              Look for state parks, rural roads, or designated dark sky preserves.
            </p>
            <div className="bortle-tips__stat">
              <span className="bortle-tips__stat-value">2-3</span>
              <span className="bortle-tips__stat-label">class improvement</span>
            </div>
          </div>

          <Link to="/moon" className="bortle-tips__card bortle-tips__card--link">
            <div className="bortle-tips__icon">
              <i className="fa-regular fa-moon" />
            </div>
            <h3 className="bortle-tips__title">Time Your Sessions</h3>
            <p className="bortle-tips__text">
              Plan around the <span className="bortle-tips__highlight">moon phase</span>. New moon week provides the darkest skies.
            </p>
          </Link>

          <div className="bortle-tips__card">
            <div className="bortle-tips__icon">
              <i className="fa-solid fa-eye" />
            </div>
            <h3 className="bortle-tips__title">Dark Adapt Your Eyes</h3>
            <p className="bortle-tips__text">
              Allow 20-30 minutes to fully adapt. Use red light only.
            </p>
          </div>

          {/* Wide card - spans 2 columns */}
          <div className="bortle-tips__card bortle-tips__card--wide">
            <div className="bortle-tips__icon">
              <i className="fa-solid fa-mountain" />
            </div>
            <div className="bortle-tips__content">
              <h3 className="bortle-tips__title">Use Terrain Wisely</h3>
              <p className="bortle-tips__text">
                Hills and mountains can block light pollution from nearby cities.
                Position yourself so terrain shields you from the worst light domes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* User's Class Detail (if available) */}
      {userBortleData && (
        <section className="bortle-section bortle-user-section" ref={(el) => (featuresRef.current[3] = el)}>
          <div className="bortle-user">
            <div className="bortle-user__header">
              <span className="bortle-user__eyebrow">Your Current Sky</span>
              <div className="bortle-user__class">
                <span className="bortle-user__class-number">{userBortle}</span>
                <span className="bortle-user__class-name">{userBortleData.name}</span>
              </div>
            </div>
            <p className="bortle-user__description">{userBortleData.description}</p>
            <div className="bortle-user__visibility">
              <h4 className="bortle-user__visibility-title">What you can see:</h4>
              <ul className="bortle-user__visibility-list">
                {userBortleData.visibility.map((item, i) => (
                  <li key={i} className={`bortle-user__visibility-item--${item.icon}`}>
                    <i className={`fa-solid fa-${item.icon}`} />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="bortle-bottom" ref={bottomCtaRef}>
        <h2 className="bortle-bottom__title">Find Darker Skies</h2>
        <p className="bortle-bottom__text">
          Explore our light pollution map to discover better observing locations near you.
        </p>
        <Link to="/explore?view=map&lightPollution=true" className="bortle-bottom__cta">
          <span className="bortle-bottom__cta-label">Explore</span>
          View Light Pollution Map
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>

      {/* Back Link */}
      <nav className="bortle-back">
        <Link to="/sky" className="bortle-back__link">
          <i className="fa-solid fa-arrow-left" />
          Back to Sky Conditions
        </Link>
      </nav>
    </div>
  );
}

export default BortlePage;
