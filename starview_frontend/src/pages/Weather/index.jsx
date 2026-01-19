/* Weather Educational Page
 * Explains how weather conditions affect stargazing.
 * Observatory-style design matching the Moon and Bortle page aesthetics.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SunCalc from 'suncalc';
import { useSEO } from '../../hooks/useSEO';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useWeather } from '../../hooks/useWeather';
import WeatherGraphic from '../../components/shared/WeatherGraphic';
import './styles.css';

/**
 * Weather factors that affect stargazing
 */
const WEATHER_FACTORS = [
  {
    id: 'cloud-cover',
    name: 'Cloud Cover',
    icon: 'fa-cloud',
    description: 'The most critical factor for stargazing. Clouds block light from celestial objects, making observation impossible in overcast conditions.',
    impact: 'Directly determines visibility',
    thresholds: [
      { range: '0-10%', label: 'Excellent', description: 'Crystal clear skies - ideal for all observations' },
      { range: '10-25%', label: 'Good', description: 'Mostly clear with minimal interruption' },
      { range: '25-50%', label: 'Fair', description: 'Some gaps between clouds for observing' },
      { range: '50%+', label: 'Poor', description: 'More cloud than sky - very limited viewing' },
    ],
    tips: [
      'Check hourly forecasts - conditions can change rapidly',
      'Thin, high clouds (cirrus) are worse than they appear',
      'Look for "sucker holes" - temporary clear patches',
    ],
  },
  {
    id: 'humidity',
    name: 'Humidity',
    icon: 'fa-droplet',
    description: 'High humidity causes moisture to form on optics and creates haze that reduces contrast and sharpness of celestial objects.',
    impact: 'Affects image quality and equipment',
    thresholds: [
      { range: '0-50%', label: 'Excellent', description: 'Crisp, clear views with no fogging' },
      { range: '50-70%', label: 'Good', description: 'Slight haze possible, equipment should be fine' },
      { range: '70-85%', label: 'Fair', description: 'Noticeable haze, watch for dew on optics' },
      { range: '85%+', label: 'Poor', description: 'Heavy haze, dew heaters recommended' },
    ],
    tips: [
      'Use dew shields and heaters on telescopes',
      'Keep eyepieces warm in pockets',
      'Humidity often rises rapidly after sunset',
    ],
  },
  {
    id: 'wind',
    name: 'Wind Speed',
    icon: 'fa-wind',
    description: 'Strong winds cause telescope shake, making high-magnification viewing difficult. However, some wind can help prevent dew formation.',
    impact: 'Affects telescope stability',
    thresholds: [
      { range: '0-10 km/h', label: 'Excellent', description: 'Calm conditions - steady viewing at any magnification' },
      { range: '10-20 km/h', label: 'Good', description: 'Light breeze - stable for most observations' },
      { range: '20-35 km/h', label: 'Fair', description: 'Moderate wind - use lower magnifications' },
      { range: '35+ km/h', label: 'Poor', description: 'Strong wind - binoculars only, or stay home' },
    ],
    tips: [
      'Shield your setup from wind with your car or a windbreak',
      'Shorter, wider telescopes handle wind better',
      'Light wind actually helps prevent dew buildup',
    ],
  },
  {
    id: 'temperature',
    name: 'Temperature',
    icon: 'fa-temperature-half',
    description: 'Temperature affects both observer comfort and equipment performance. Rapid temperature changes cause telescope mirrors to "cool down" and produce distorted images.',
    impact: 'Comfort and optical performance',
    thresholds: [
      { range: '10-20°C', label: 'Ideal', description: 'Comfortable observing conditions' },
      { range: '0-10°C', label: 'Cool', description: 'Dress warmly, allow scope to acclimate' },
      { range: '-10-0°C', label: 'Cold', description: 'Multiple layers essential, battery issues' },
      { range: 'Below -10°C', label: 'Extreme', description: 'Challenging - protect equipment and yourself' },
    ],
    tips: [
      'Let your telescope cool to ambient temperature (30-60 min)',
      'Dress warmer than you think you\'ll need',
      'Lithium batteries perform better in cold than alkaline',
    ],
  },
  {
    id: 'pressure',
    name: 'Air Pressure',
    icon: 'fa-gauge-high',
    description: 'Barometric pressure indicates weather stability. High pressure systems typically bring clear, stable skies ideal for stargazing.',
    impact: 'Weather stability indicator',
    thresholds: [
      { range: 'High (>1020 hPa)', label: 'Excellent', description: 'Stable, clear conditions likely' },
      { range: 'Normal (1010-1020)', label: 'Good', description: 'Typical conditions, check forecasts' },
      { range: 'Low (<1010 hPa)', label: 'Poor', description: 'Unsettled weather, clouds likely' },
      { range: 'Falling rapidly', label: 'Warning', description: 'Weather change incoming' },
    ],
    tips: [
      'Rising pressure usually means improving conditions',
      'High pressure = good "seeing" (atmospheric stability)',
      'Check pressure trends, not just current reading',
    ],
  },
];

/**
 * Cloud cover quality tiers for the guide section
 */
const WEATHER_TIERS = [
  {
    tier: 'excellent',
    label: 'Excellent',
    color: 'blue',
    cloudRange: '0-10%',
    icon: 'fa-star',
    description: 'Perfect transparency for all observations',
    bestFor: [
      'Faint deep-sky objects (nebulae, galaxies)',
      'Astrophotography of any target',
      'Milky Way photography',
      'Planetary detail at high magnification',
    ],
  },
  {
    tier: 'good',
    label: 'Good',
    color: 'green',
    cloudRange: '10-25%',
    icon: 'fa-thumbs-up',
    description: 'Minor interruptions, excellent overall',
    bestFor: [
      'Most deep-sky objects',
      'Planetary observation',
      'Star clusters and double stars',
      'Casual astrophotography',
    ],
  },
  {
    tier: 'fair',
    label: 'Fair',
    color: 'yellow',
    cloudRange: '25-50%',
    icon: 'fa-clock',
    description: 'Patience required, watch for clear windows',
    bestFor: [
      'Moon and bright planets',
      'Bright star clusters',
      'Quick observing sessions',
      'Testing equipment setups',
    ],
  },
  {
    tier: 'poor',
    label: 'Poor',
    color: 'red',
    cloudRange: '50%+',
    icon: 'fa-triangle-exclamation',
    description: 'Limited visibility, consider rescheduling',
    bestFor: [
      'Moon observation (if visible)',
      'Bright planets through gaps',
      'Equipment maintenance instead',
      'Planning future sessions',
    ],
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

/**
 * Get quality tier from cloud cover percentage
 */
const getCloudQuality = (cloudCover) => {
  if (cloudCover === null || cloudCover === undefined) return null;
  if (cloudCover <= 10) return 'excellent';
  if (cloudCover <= 25) return 'good';
  if (cloudCover <= 50) return 'fair';
  return 'poor';
};

/**
 * Check if it's currently night at a given location.
 * Uses sun altitude - night is when sun is below horizon (altitude < 0).
 */
const checkIsNight = (lat, lng) => {
  if (lat === undefined || lng === undefined) return true;
  const sunPos = SunCalc.getPosition(new Date(), lat, lng);
  return sunPos.altitude < 0;
};

function WeatherPage() {
  const sectionsRef = useRef([]);
  const bottomCtaRef = useRef(null);
  const [selectedFactor, setSelectedFactor] = useState(0);

  // Live data hooks
  const { location, source: locationSource } = useUserLocation();
  const lat = location?.latitude;
  const lng = location?.longitude;
  const hasLocation = lat !== undefined && lng !== undefined;

  const {
    cloudCover,
    humidity,
    windSpeed,
    temperature,
    precipitationType,
    precipitationProbability,
    isLoading: weatherLoading,
  } = useWeather({
    lat,
    lng,
    enabled: hasLocation,
  });

  // Memoized display values
  const displayData = useMemo(() => ({
    cloudCover,
    humidity,
    windSpeed,
    temperature,
    quality: getCloudQuality(cloudCover),
    date: formatDate(),
    locationLabel: locationSource === 'profile' ? 'PROFILE' : locationSource === 'browser' ? 'GPS' : null,
    isNight: checkIsNight(lat, lng),
  }), [cloudCover, humidity, windSpeed, temperature, locationSource, lat, lng]);

  // Current factor being displayed
  const currentFactor = WEATHER_FACTORS[selectedFactor];

  // Scroll-triggered animations using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains('weather-bottom')) {
              entry.target.classList.add('weather-bottom--visible');
            } else {
              entry.target.classList.add('weather-section--visible');
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    sectionsRef.current.forEach((el) => {
      if (el && !el.classList.contains('weather-section--visible')) {
        observer.observe(el);
      }
    });

    if (bottomCtaRef.current && !bottomCtaRef.current.classList.contains('weather-bottom--visible')) {
      observer.observe(bottomCtaRef.current);
    }

    return () => observer.disconnect();
  }, [hasLocation]);

  useSEO({
    title: 'Weather for Stargazing | Starview',
    description: 'Learn how weather conditions affect stargazing. Understand cloud cover, humidity, wind, and temperature impacts on your astronomical observations.',
    path: '/weather',
  });

  return (
    <div className="weather-page">
      {/* Observatory-Style Hero Section */}
      <header className="weather-hero">
        {/* Grid overlay */}
        <div className="weather-hero__grid" aria-hidden="true" />

        {/* Scan line effect */}
        <div className="weather-hero__scanline" aria-hidden="true" />

        {/* Corner brackets */}
        <svg className="weather-hero__bracket weather-hero__bracket--tl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 40 L0 0 L40 0" fill="none" strokeWidth="2" />
        </svg>
        <svg className="weather-hero__bracket weather-hero__bracket--tr" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L40 0 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="weather-hero__bracket weather-hero__bracket--bl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L0 40 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="weather-hero__bracket weather-hero__bracket--br" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M40 0 L40 40 L0 40" fill="none" strokeWidth="2" />
        </svg>

        {/* Status bar (top) */}
        <div className="weather-hero__status-bar">
          <div className="weather-hero__status">
            <span className="weather-hero__status-dot" />
            <span className="weather-hero__status-text">REFERENCE</span>
          </div>
          <span className="weather-hero__status-label">ATMOSPHERIC CONDITIONS</span>
          <span className="weather-hero__status-date">{displayData.date}</span>
        </div>

        {/* Main content */}
        <div className="weather-hero__content">
          <h1 className="weather-hero__title">
            Weather &amp; Stargazing
          </h1>
          <p className="weather-hero__text">
            Understanding atmospheric conditions is essential for successful observation.
            Learn which factors matter most and how to plan around them.
          </p>
        </div>

        {/* Current conditions (bottom) */}
        <div className="weather-hero__data-strip">
          {hasLocation && displayData.cloudCover !== null ? (
            <>
              <div className="weather-hero__data-item weather-hero__data-item--highlight">
                <span className="weather-hero__data-label">CLOUD COVER</span>
                <span className="weather-hero__data-value weather-hero__data-value--large">
                  {displayData.cloudCover}%
                </span>
              </div>
              <div className="weather-hero__data-item">
                <span className="weather-hero__data-label">CONDITIONS</span>
                <span className={`weather-hero__data-value weather-hero__data-value--quality weather-hero__data-value--${displayData.quality}`}>
                  {displayData.quality ? displayData.quality.charAt(0).toUpperCase() + displayData.quality.slice(1) : '--'}
                </span>
              </div>
            </>
          ) : (
            <div className="weather-hero__data-item weather-hero__data-item--empty">
              <span className="weather-hero__data-label">CONDITIONS</span>
              <span className="weather-hero__data-value">
                {weatherLoading ? 'Loading...' : 'Enable location to see'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Interactive 5-Factor Panel */}
      <section className="weather-section weather-factors-section" ref={(el) => (sectionsRef.current[0] = el)}>
        <div className="weather-section__header">
          <span className="weather-section__eyebrow">Interactive Guide</span>
          <h2 className="weather-section__title">5 Factors That Affect Stargazing</h2>
          <p className="weather-section__subtitle">
            Tap a factor to learn how it impacts your observations
          </p>
        </div>

        <div className="weather-factors">
          <div className="weather-factors__tabs">
            {WEATHER_FACTORS.map((factor, index) => (
              <button
                key={factor.id}
                className={`weather-factors__tab ${selectedFactor === index ? 'weather-factors__tab--selected' : ''}`}
                onClick={() => setSelectedFactor(index)}
                aria-selected={selectedFactor === index}
                style={{ '--factor-delay': `${0.05 * index}s` }}
              >
                <i className={`fa-solid ${factor.icon}`} />
                <span className="weather-factors__tab-name">{factor.name}</span>
                {hasLocation && index === 0 && displayData.cloudCover !== null && (
                  <span className="weather-factors__tab-value">{displayData.cloudCover}%</span>
                )}
                {hasLocation && index === 1 && displayData.humidity !== null && (
                  <span className="weather-factors__tab-value">{displayData.humidity}%</span>
                )}
                {hasLocation && index === 2 && displayData.windSpeed !== null && (
                  <span className="weather-factors__tab-value">{displayData.windSpeed} km/h</span>
                )}
                {hasLocation && index === 3 && displayData.temperature !== null && (
                  <span className="weather-factors__tab-value">{displayData.temperature}°C</span>
                )}
              </button>
            ))}
          </div>

          <div className="weather-factors__panel">
            <div className="weather-factors__panel-header">
              <i className={`fa-solid ${currentFactor.icon}`} />
              <div>
                <h3 className="weather-factors__panel-title">{currentFactor.name}</h3>
                <span className="weather-factors__panel-impact">{currentFactor.impact}</span>
              </div>
            </div>

            <p className="weather-factors__panel-desc">{currentFactor.description}</p>

            <div className="weather-factors__thresholds">
              <h4 className="weather-factors__thresholds-title">Quality Thresholds</h4>
              <div className="weather-factors__thresholds-grid">
                {currentFactor.thresholds.map((threshold, i) => (
                  <div key={i} className={`weather-factors__threshold weather-factors__threshold--${threshold.label.toLowerCase()}`}>
                    <span className="weather-factors__threshold-range">{threshold.range}</span>
                    <span className="weather-factors__threshold-label">{threshold.label}</span>
                    <span className="weather-factors__threshold-desc">{threshold.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="weather-factors__tips">
              <h4 className="weather-factors__tips-title">
                <i className="fa-solid fa-lightbulb" />
                Pro Tips
              </h4>
              <ul className="weather-factors__tips-list">
                {currentFactor.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Live Weather Section */}
      {hasLocation && (
        <section className="weather-section weather-live-section" ref={(el) => (sectionsRef.current[1] = el)}>
          <div className="weather-section__header">
            <span className="weather-section__eyebrow">Current Conditions</span>
            <h2 className="weather-section__title">Your Weather Now</h2>
            <p className="weather-section__subtitle">
              Real-time atmospheric data for your location
            </p>
          </div>

          <div className="weather-live">
            <div className="weather-live__graphic">
              <WeatherGraphic
                cloudCover={displayData.cloudCover}
                precipitationType={precipitationType}
                precipitationProbability={precipitationProbability}
                size={120}
                isNight={displayData.isNight}
              />
            </div>

            <div className="weather-live__metrics">
              <div className="weather-live__metric">
                <i className="fa-solid fa-cloud" />
                <span className="weather-live__metric-value">
                  {displayData.cloudCover !== null ? `${displayData.cloudCover}%` : '--'}
                </span>
                <span className="weather-live__metric-label">Cloud Cover</span>
              </div>
              <div className="weather-live__metric">
                <i className="fa-solid fa-droplet" />
                <span className="weather-live__metric-value">
                  {displayData.humidity !== null ? `${displayData.humidity}%` : '--'}
                </span>
                <span className="weather-live__metric-label">Humidity</span>
              </div>
              <div className="weather-live__metric">
                <i className="fa-solid fa-wind" />
                <span className="weather-live__metric-value">
                  {displayData.windSpeed !== null ? `${displayData.windSpeed}` : '--'}
                </span>
                <span className="weather-live__metric-label">Wind (km/h)</span>
              </div>
              <div className="weather-live__metric">
                <i className="fa-solid fa-temperature-half" />
                <span className="weather-live__metric-value">
                  {displayData.temperature !== null ? `${displayData.temperature}°` : '--'}
                </span>
                <span className="weather-live__metric-label">Temperature</span>
              </div>
            </div>

            {displayData.quality && (
              <div className={`weather-live__quality weather-live__quality--${displayData.quality}`}>
                <span className="weather-live__quality-label">Stargazing Conditions:</span>
                <span className="weather-live__quality-value">
                  {displayData.quality.charAt(0).toUpperCase() + displayData.quality.slice(1)}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quality Tiers Guide */}
      <section className="weather-section weather-guide-section" ref={(el) => (sectionsRef.current[2] = el)}>
        <div className="weather-section__header">
          <span className="weather-section__eyebrow">Visibility Guide</span>
          <h2 className="weather-section__title">Cloud Cover Quality Tiers</h2>
          <p className="weather-section__subtitle">
            What to expect at different cloud cover levels
          </p>
        </div>

        <div className="weather-guide">
          {WEATHER_TIERS.map((tier) => (
            <div key={tier.tier} className={`weather-guide__tier weather-guide__tier--${tier.color}`}>
              <div className="weather-guide__tier-header">
                <div className="weather-guide__tier-badge">
                  <i className={`fa-solid ${tier.icon}`} />
                </div>
                <div>
                  <h3 className="weather-guide__tier-title">{tier.label}</h3>
                  <span className="weather-guide__tier-range">{tier.cloudRange} clouds</span>
                </div>
              </div>
              <p className="weather-guide__tier-desc">{tier.description}</p>
              <ul className="weather-guide__list">
                {tier.bestFor.map((item, i) => (
                  <li key={i}>
                    <i className="fa-solid fa-check" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Practical Tips Section (Bento Grid) */}
      <section className="weather-section weather-tips-section" ref={(el) => (sectionsRef.current[3] = el)}>
        <div className="weather-section__header">
          <span className="weather-section__eyebrow">Practical Advice</span>
          <h2 className="weather-section__title">Weather Planning Tips</h2>
        </div>

        <div className="weather-tips">
          {/* Hero card */}
          <div className="weather-tips__card weather-tips__card--hero">
            <div className="weather-tips__icon weather-tips__icon--large">
              <i className="fa-solid fa-satellite-dish" />
            </div>
            <h3 className="weather-tips__title">Check Multiple Sources</h3>
            <p className="weather-tips__text">
              Weather forecasts can vary significantly between services. Check 2-3 sources
              and look for agreement. Clear Sky Chart, Windy, and local forecasts each
              have strengths for astronomical planning.
            </p>
            <div className="weather-tips__stat">
              <span className="weather-tips__stat-value">3+</span>
              <span className="weather-tips__stat-label">hours notice ideal</span>
            </div>
          </div>

          <Link to="/moon" className="weather-tips__card weather-tips__card--link">
            <div className="weather-tips__icon">
              <i className="fa-regular fa-moon" />
            </div>
            <h3 className="weather-tips__title">Consider the Moon</h3>
            <p className="weather-tips__text">
              Clear skies during a <span className="weather-tips__highlight">full moon</span> can be worse than partly cloudy skies during new moon. Balance both factors.
            </p>
          </Link>

          <div className="weather-tips__card">
            <div className="weather-tips__icon">
              <i className="fa-solid fa-clock" />
            </div>
            <h3 className="weather-tips__title">Be Flexible</h3>
            <p className="weather-tips__text">
              Conditions often improve after midnight as weather systems move. Stay ready to observe when windows appear.
            </p>
          </div>

          {/* Wide card */}
          <div className="weather-tips__card weather-tips__card--wide">
            <div className="weather-tips__icon">
              <i className="fa-solid fa-chart-line" />
            </div>
            <div className="weather-tips__content">
              <h3 className="weather-tips__title">Watch the Trends</h3>
              <p className="weather-tips__text">
                A forecast showing 30% cloud cover and falling is better than 20% and rising.
                Pay attention to whether conditions are improving or deteriorating.
                High pressure systems moving in typically mean several good nights ahead.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="weather-bottom" ref={bottomCtaRef}>
        <h2 className="weather-bottom__title">Check Tonight&apos;s Forecast</h2>
        <p className="weather-bottom__text">
          See real-time weather conditions combined with moon phase and light pollution for your location.
        </p>
        <Link to="/tonight" className="weather-bottom__cta">
          <span className="weather-bottom__cta-label">Tonight</span>
          View Tonight&apos;s Conditions
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>

      {/* Back Link */}
      <nav className="weather-back">
        <Link to="/sky" className="weather-back__link">
          <i className="fa-solid fa-arrow-left" />
          Back to Sky Conditions
        </Link>
      </nav>
    </div>
  );
}

export default WeatherPage;
