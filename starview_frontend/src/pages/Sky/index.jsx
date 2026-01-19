/* Sky Hub Page
 * Landing page for all stargazing conditions content.
 * Observatory control panel aesthetic with live data integration.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useTodayMoonPhase } from '../../hooks/useMoonPhases';
import { useBortle } from '../../hooks/useBortle';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import './styles.css';

/**
 * Format coordinates for display (e.g., "37.77°N 122.42°W")
 */
const formatCoordinates = (lat, lng) => {
  if (lat === undefined || lng === undefined) return null;
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lng).toFixed(2)}°${lngDir}`;
};

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

function SkyPage() {
  const featuresRef = useRef([]);
  const bottomCtaRef = useRef(null);

  // Live data hooks
  const { location, source: locationSource } = useUserLocation();
  const lat = location?.latitude;
  const lng = location?.longitude;
  const hasLocation = lat !== undefined && lng !== undefined;

  const { todayPhase } = useTodayMoonPhase({
    lat,
    lng,
    enabled: hasLocation,
  });

  const { bortle } = useBortle({
    lat,
    lng,
    enabled: hasLocation,
  });

  // Memoized display values
  const displayData = useMemo(() => ({
    coordinates: hasLocation ? formatCoordinates(lat, lng) : null,
    moonPhase: todayPhase?.phase_name || null,
    moonIllum: todayPhase?.illumination != null ? Math.round(todayPhase.illumination) : null,
    isWaning: todayPhase?.is_waning || false,
    bortle: bortle,
    date: formatDate(),
    locationLabel: locationSource === 'profile' ? 'PROFILE' : locationSource === 'browser' ? 'GPS' : null,
  }), [hasLocation, lat, lng, todayPhase, bortle, locationSource]);

  // Scroll-triggered animations using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Add appropriate visible class based on element
            if (entry.target.classList.contains('sky-bottom')) {
              entry.target.classList.add('sky-bottom--visible');
            } else {
              entry.target.classList.add('sky-feature--visible');
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    featuresRef.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    // Also observe the bottom CTA
    if (bottomCtaRef.current) {
      observer.observe(bottomCtaRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useSEO({
    title: 'Sky Conditions | Starview',
    description: "Plan your stargazing sessions with real-time sky conditions, moon phases, weather forecasts, and light pollution data.",
    path: '/sky',
  });

  return (
    <div className="sky-page">
      {/* Observatory-Style Hero Section */}
      <header className="sky-hero">
        {/* Grid overlay */}
        <div className="sky-hero__grid" aria-hidden="true" />

        {/* Scan line effect */}
        <div className="sky-hero__scanline" aria-hidden="true" />

        {/* Corner brackets */}
        <svg className="sky-hero__bracket sky-hero__bracket--tl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 40 L0 0 L40 0" fill="none" strokeWidth="2" />
        </svg>
        <svg className="sky-hero__bracket sky-hero__bracket--tr" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L40 0 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="sky-hero__bracket sky-hero__bracket--bl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L0 40 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="sky-hero__bracket sky-hero__bracket--br" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M40 0 L40 40 L0 40" fill="none" strokeWidth="2" />
        </svg>

        {/* Status bar (top) */}
        <div className="sky-hero__status-bar">
          <div className="sky-hero__status">
            <span className="sky-hero__status-dot" />
            <span className="sky-hero__status-text">OPERATIONAL</span>
          </div>
          <span className="sky-hero__status-label">SKY CONDITIONS</span>
          <span className="sky-hero__status-date">{displayData.date}</span>
        </div>

        {/* Main content */}
        <div className="sky-hero__content">
          <h1 className="sky-hero__title">
            Know before you go
          </h1>
          <p className="sky-hero__text">
            Real-time conditions, forecasts, and tools to help you
            find the perfect night for stargazing.
          </p>
        </div>

        {/* Data strip (bottom) */}
        <div className="sky-hero__data-strip">
          {displayData.coordinates ? (
            <div className="sky-hero__data-item">
              <span className="sky-hero__data-label">LOC</span>
              <span className="sky-hero__data-value">{displayData.coordinates}</span>
              {displayData.locationLabel && (
                <span className="sky-hero__data-source">{displayData.locationLabel}</span>
              )}
            </div>
          ) : (
            <div className="sky-hero__data-item sky-hero__data-item--empty">
              <span className="sky-hero__data-label">LOC</span>
              <span className="sky-hero__data-value">--</span>
            </div>
          )}

          <div className="sky-hero__data-divider" />

          {displayData.moonPhase ? (
            <div className="sky-hero__data-item">
              <span className="sky-hero__data-label">MOON</span>
              <span className="sky-hero__data-value">
                {displayData.moonIllum}% {displayData.isWaning ? 'WANING' : 'WAXING'}
              </span>
            </div>
          ) : (
            <div className="sky-hero__data-item sky-hero__data-item--empty">
              <span className="sky-hero__data-label">MOON</span>
              <span className="sky-hero__data-value">--</span>
            </div>
          )}

          <div className="sky-hero__data-divider" />

          {displayData.bortle ? (
            <div className="sky-hero__data-item">
              <span className="sky-hero__data-label">BORTLE</span>
              <span className="sky-hero__data-value">CLASS {displayData.bortle}</span>
            </div>
          ) : (
            <div className="sky-hero__data-item sky-hero__data-item--empty">
              <span className="sky-hero__data-label">BORTLE</span>
              <span className="sky-hero__data-value">--</span>
            </div>
          )}
        </div>
      </header>

      {/* Tonight Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[0] = el)}>
        <div className="sky-feature__visual">
          <div className="sky-feature__card">
            <div className="sky-feature__ring-container">
              <svg className="sky-feature__ring" viewBox="0 0 200 200">
                <circle
                  className="sky-feature__ring-track"
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  strokeWidth="8"
                />
                <circle
                  className="sky-feature__ring-progress"
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="565.5"
                  strokeDashoffset="124"
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="sky-feature__score">
                <span className="sky-feature__score-value">78</span>
                <span className="sky-feature__score-label">Sky Score</span>
              </div>
            </div>
            <div className="sky-feature__stats">
              <div className="sky-feature__stat">
                <i className="fa-solid fa-moon" />
                <span>12%</span>
              </div>
              <div className="sky-feature__stat">
                <i className="fa-solid fa-cloud" />
                <span>8%</span>
              </div>
              <div className="sky-feature__stat">
                <i className="fa-solid fa-eye" />
                <span>4</span>
              </div>
            </div>
          </div>
        </div>
        <div className="sky-feature__content">
          <span className="sky-feature__eyebrow">Tonight's Conditions</span>
          <h2 className="sky-feature__title">
            Should you go out tonight?
          </h2>
          <p className="sky-feature__text">
            Get an instant answer with our sky quality score. We combine moon phase,
            cloud cover, and light pollution data to tell you exactly how good
            tonight will be for stargazing at your location.
          </p>
          <Link to="/tonight" className="sky-feature__link">
            See full forecast
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* Moon Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[1] = el)}>
        <div className="sky-feature__visual">
          <div className="sky-feature__lunar-cycle">
            {/* Lunar cycle strip: new → full → new */}
            <div className="sky-feature__lunar-strip">
              {[
                { illumination: 0, isWaning: false },    // New Moon
                { illumination: 25, isWaning: false },   // Waxing Crescent
                { illumination: 50, isWaning: false },   // First Quarter
                { illumination: 75, isWaning: false },   // Waxing Gibbous
                { illumination: 100, isWaning: false },  // Full Moon
                { illumination: 75, isWaning: true },    // Waning Gibbous
                { illumination: 50, isWaning: true },    // Last Quarter
              ].map((phase, i) => (
                <div key={i} className="sky-feature__lunar-phase">
                  <MoonPhaseGraphic
                    illumination={phase.illumination}
                    isWaning={phase.isWaning}
                    rotationAngle={0}
                    size={44}
                    className="sky-feature__lunar-moon"
                  />
                </div>
              ))}
            </div>
            <p className="sky-feature__lunar-label">Lunar Cycle</p>
          </div>
        </div>
        <div className="sky-feature__content">
          <span className="sky-feature__eyebrow">Moon Calendar</span>
          <h2 className="sky-feature__title">
            Plan around the moon
          </h2>
          <p className="sky-feature__text">
            The <Link to="/moon" className="sky-feature__inline-link">8 lunar phases</Link> affect
            what you can see in the night sky. New moons offer the darkest skies
            for deep-sky observation, while full moons are perfect for lunar
            photography and nighttime hikes.
          </p>
          <Link to="/moon" className="sky-feature__link">
            Learn about moon phases
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* Light Pollution Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[2] = el)}>
        <div className="sky-feature__visual">
          <div className="sky-feature__bortle">
            <div className="sky-feature__bortle-scale">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
                <div
                  key={level}
                  className={`sky-feature__bortle-bar sky-feature__bortle-bar--${level}`}
                >
                  <span>{level}</span>
                </div>
              ))}
            </div>
            <p className="sky-feature__bortle-label">Bortle Scale</p>
          </div>
        </div>
        <div className="sky-feature__content">
          <span className="sky-feature__eyebrow">Light Pollution</span>
          <h2 className="sky-feature__title">
            Find darker skies
          </h2>
          <p className="sky-feature__text">
            The <Link to="/bortle" className="sky-feature__inline-link">Bortle scale</Link> measures
            sky darkness from 1 (pristine) to 9 (inner-city). Understanding your local light
            pollution helps set realistic expectations and discover better observing sites nearby.
          </p>
          <Link to="/explore" className="sky-feature__link">
            Explore the map
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* Weather Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[3] = el)}>
        <div className="sky-feature__visual">
          <div className="sky-feature__weather">
            {/* Atmospheric layers visualization */}
            <div className="sky-feature__atmosphere">
              {/* Star field at top (space) */}
              <div className="sky-feature__atmosphere-stars">
                <svg viewBox="0 0 200 40" className="sky-feature__stars-svg">
                  <circle cx="20" cy="15" r="1.5" fill="white" opacity="0.9" />
                  <circle cx="45" cy="8" r="1" fill="white" opacity="0.7" />
                  <circle cx="70" cy="22" r="1.2" fill="white" opacity="0.8" />
                  <circle cx="95" cy="12" r="0.8" fill="white" opacity="0.6" />
                  <circle cx="120" cy="28" r="1.3" fill="white" opacity="0.85" />
                  <circle cx="145" cy="10" r="1" fill="white" opacity="0.75" />
                  <circle cx="170" cy="20" r="1.4" fill="white" opacity="0.9" />
                  <circle cx="185" cy="32" r="0.9" fill="white" opacity="0.65" />
                  <circle cx="55" cy="30" r="0.7" fill="white" opacity="0.5" />
                  <circle cx="130" cy="5" r="1.1" fill="white" opacity="0.8" />
                </svg>
              </div>

              {/* Atmospheric layers */}
              <div className="sky-feature__atmosphere-layer sky-feature__atmosphere-layer--high">
                <span className="sky-feature__layer-label">Cirrus</span>
              </div>
              <div className="sky-feature__atmosphere-layer sky-feature__atmosphere-layer--mid">
                <span className="sky-feature__layer-label">Alto</span>
              </div>
              <div className="sky-feature__atmosphere-layer sky-feature__atmosphere-layer--low">
                <span className="sky-feature__layer-label">Cumulus</span>
              </div>

            </div>

            {/* Transparency meter */}
            <div className="sky-feature__transparency">
              <div className="sky-feature__transparency-bar">
                <div className="sky-feature__transparency-fill" />
                <div className="sky-feature__transparency-marker" />
              </div>
              <span className="sky-feature__transparency-label">Transparency</span>
            </div>
          </div>
        </div>
        <div className="sky-feature__content">
          <span className="sky-feature__eyebrow">Atmospheric Conditions</span>
          <h2 className="sky-feature__title">
            Read the atmosphere
          </h2>
          <p className="sky-feature__text">
            <Link to="/weather" className="sky-feature__inline-link">Cloud cover</Link>, humidity,
            and atmospheric turbulence determine how clearly you'll see the stars. Learn which
            weather factors matter most and how to interpret forecasts for stargazing.
          </p>
          <Link to="/weather" className="sky-feature__link">
            Understand weather factors
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* Forecast Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[4] = el)}>
        <div className="sky-feature__visual">
          <div className="sky-feature__forecast">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
              <div key={day} className="sky-feature__forecast-day">
                <span className="sky-feature__forecast-label">{day}</span>
                <div
                  className="sky-feature__forecast-bar"
                  style={{ '--height': `${30 + Math.sin(i * 0.8) * 40 + 30}%` }}
                />
                <i className={`fa-solid ${i === 2 || i === 5 ? 'fa-star' : 'fa-cloud'}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="sky-feature__content">
          <span className="sky-feature__eyebrow">7-Day Forecast</span>
          <h2 className="sky-feature__title">
            Plan your week
          </h2>
          <p className="sky-feature__text">
            Don't miss the best nights. Our extended forecast combines weather
            predictions with astronomical data to highlight the optimal evenings
            for stargazing in the week ahead.
          </p>
          <span className="sky-feature__badge">Coming Soon</span>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="sky-bottom" ref={bottomCtaRef}>
        <h2 className="sky-bottom__title">Ready to explore?</h2>
        <p className="sky-bottom__text">
          Check tonight's conditions and discover the best time to head out.
        </p>
        <Link to="/tonight" className="sky-bottom__cta">
          <span className="sky-bottom__cta-label">Initiate</span>
          See Tonight's Forecast
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>
    </div>
  );
}

export default SkyPage;
