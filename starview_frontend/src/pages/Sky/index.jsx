/* Sky Hub Page
 * Landing page for all stargazing conditions content.
 * Clean layout with visual elements for each topic area.
 */

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import './styles.css';

function SkyPage() {
  const featuresRef = useRef([]);

  // Scroll-triggered animations using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('sky-feature--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    featuresRef.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useSEO({
    title: 'Sky Conditions | Starview',
    description: "Plan your stargazing sessions with real-time sky conditions, moon phases, weather forecasts, and light pollution data.",
    path: '/sky',
  });

  return (
    <div className="sky-page">
      {/* Hero Section */}
      <header className="sky-hero">
        <span className="sky-hero__label">Sky Conditions</span>
        <h1 className="sky-hero__title">
          Know before you go
        </h1>
        <p className="sky-hero__text">
          Real-time conditions, forecasts, and tools to help you
          find the perfect night for stargazing.
        </p>
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
            Track lunar phases month by month. New moons offer the darkest skies
            for deep-sky observation, while full moons are perfect for lunar
            photography and nighttime hikes.
          </p>
          <span className="sky-feature__badge">Coming Soon</span>
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
            The Bortle scale measures sky darkness from 1 (pristine) to 9 (inner-city).
            Understanding your local light pollution helps set realistic expectations
            and discover better observing sites nearby.
          </p>
          <Link to="/explore" className="sky-feature__link">
            Explore the map
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* Forecast Feature */}
      <section className="sky-feature" ref={(el) => (featuresRef.current[3] = el)}>
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
      <section className="sky-bottom">
        <h2 className="sky-bottom__title">Ready to explore?</h2>
        <p className="sky-bottom__text">
          Check tonight's conditions and discover the best time to head out.
        </p>
        <Link to="/tonight" className="btn-primary">
          See Tonight's Forecast
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>
    </div>
  );
}

export default SkyPage;
