/* Moon Educational Page
 * Explains moon phases and their impact on stargazing.
 * Observatory-style design matching the Bortle page aesthetic.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import { useTodayMoonPhase } from '../../hooks/useMoonPhases';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import './styles.css';

/**
 * Moon phase data with descriptions and stargazing info
 */
const MOON_PHASES = [
  {
    id: 'new',
    name: 'New Moon',
    illuminationRange: '0%',
    description: 'The Moon is between Earth and Sun, with its dark side facing us. The sky is at its darkest.',
    stargazing: {
      quality: 'excellent',
      rating: 'Optimal',
      tips: [
        'Best time for deep-sky objects',
        'Ideal for astrophotography',
        'Perfect for viewing the Milky Way',
        'Faintest galaxies visible',
      ],
    },
    bestFor: ['Deep-sky objects', 'Nebulae', 'Astrophotography', 'Milky Way'],
  },
  {
    id: 'waxing-crescent',
    name: 'Waxing Crescent',
    illuminationRange: '1-49%',
    description: 'A sliver of light appears on the right side (Northern Hemisphere). The Moon sets a few hours after sunset.',
    stargazing: {
      quality: 'good',
      rating: 'Good',
      tips: [
        'Good deep-sky viewing after moonset',
        'Moon sets early evening',
        'Plan sessions for late night',
        'Earthshine visible on dark portion',
      ],
    },
    bestFor: ['Deep-sky after moonset', 'Earthshine observation', 'Late-night sessions'],
  },
  {
    id: 'first-quarter',
    name: 'First Quarter',
    illuminationRange: '50%',
    description: 'Half the Moon is illuminated. It rises around noon and sets around midnight.',
    stargazing: {
      quality: 'moderate',
      rating: 'Moderate',
      tips: [
        'Dark skies after midnight',
        'Good for late-night sessions',
        'Bright objects still visible',
        'Moon at its highest at sunset',
      ],
    },
    bestFor: ['Late-night sessions', 'Bright clusters', 'Planets'],
  },
  {
    id: 'waxing-gibbous',
    name: 'Waxing Gibbous',
    illuminationRange: '51-99%',
    description: 'More than half illuminated, approaching full. The Moon dominates the evening sky.',
    stargazing: {
      quality: 'poor',
      rating: 'Challenging',
      tips: [
        'Moon washes out faint objects',
        'Focus on lunar observation',
        'Planets remain visible',
        'Wait for very late night',
      ],
    },
    bestFor: ['Moon features', 'Planets', 'Bright stars only'],
  },
  {
    id: 'full',
    name: 'Full Moon',
    illuminationRange: '100%',
    description: 'The entire face is illuminated. The Moon rises at sunset and sets at sunrise.',
    stargazing: {
      quality: 'poor',
      rating: 'Poor',
      tips: [
        'Worst time for deep-sky',
        'Excellent for lunar observation',
        'Bright planets still visible',
        'Consider taking a break',
      ],
    },
    bestFor: ['Lunar features', 'Bright planets', 'Moon photography'],
  },
  {
    id: 'waning-gibbous',
    name: 'Waning Gibbous',
    illuminationRange: '51-99%',
    description: 'Past full, shrinking from the left (Northern Hemisphere). Rises after sunset.',
    stargazing: {
      quality: 'poor',
      rating: 'Challenging',
      tips: [
        'Evening sessions before moonrise',
        'Moon rises late evening',
        'Plan for early night',
        'Dark skies at dusk',
      ],
    },
    bestFor: ['Early evening sessions', 'Moon features', 'Planets'],
  },
  {
    id: 'third-quarter',
    name: 'Third Quarter',
    illuminationRange: '50%',
    description: 'Half illuminated (opposite side from First Quarter). Rises around midnight.',
    stargazing: {
      quality: 'moderate',
      rating: 'Moderate',
      tips: [
        'Dark skies until midnight',
        'Great for evening sessions',
        'Moon rises around midnight',
        'Ideal timing for western sky',
      ],
    },
    bestFor: ['Evening sessions', 'Western sky objects', 'Bright clusters'],
  },
  {
    id: 'waning-crescent',
    name: 'Waning Crescent',
    illuminationRange: '1-49%',
    description: 'A sliver on the left side (Northern Hemisphere). Only visible in pre-dawn sky.',
    stargazing: {
      quality: 'good',
      rating: 'Good',
      tips: [
        'Excellent evening viewing',
        'Moon rises after midnight',
        'Most of night is dark',
        'Earthshine visible',
      ],
    },
    bestFor: ['Evening deep-sky', 'Pre-dawn moon', 'Earthshine observation'],
  },
];

/**
 * Stargazing quality tier data
 */
const STARGAZING_TIERS = [
  {
    tier: 'optimal',
    label: 'Optimal',
    phases: ['New Moon'],
    color: 'dark-blue',
    icon: 'fa-star',
    description: 'The darkest skies of the lunar cycle',
    bestFor: [
      'Deep-sky objects and faint nebulae',
      'Astrophotography of any target',
      'Milky Way core observation',
      'Faint galaxies and star clusters',
    ],
  },
  {
    tier: 'good',
    label: 'Good',
    phases: ['Waxing Crescent', 'Waning Crescent'],
    color: 'green',
    icon: 'fa-thumbs-up',
    description: 'Plan around moonrise and moonset times',
    bestFor: [
      'Deep-sky objects when Moon is down',
      'Evening or late-night sessions',
      'Earthshine observation',
      'General stargazing',
    ],
  },
  {
    tier: 'moderate',
    label: 'Moderate',
    phases: ['First Quarter', 'Third Quarter'],
    color: 'yellow',
    icon: 'fa-clock',
    description: 'Timing is key for best results',
    bestFor: [
      'Bright star clusters and planets',
      'Session timing matters (before/after moon)',
      'First Quarter: observe after midnight',
      'Third Quarter: observe until midnight',
    ],
  },
  {
    tier: 'challenging',
    label: 'Challenging',
    phases: ['Full Moon', 'Gibbous phases'],
    color: 'red',
    icon: 'fa-triangle-exclamation',
    description: 'Focus on lunar and bright targets',
    bestFor: [
      'Lunar surface features and craters',
      'Bright planets (Jupiter, Saturn, Venus)',
      'Double stars and bright binaries',
      'Moon photography',
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
 * Get phase index (0-7) from phase name or illumination
 */
const getPhaseIndex = (phaseName) => {
  const mapping = {
    'new moon': 0,
    'waxing crescent': 1,
    'first quarter': 2,
    'waxing gibbous': 3,
    'full moon': 4,
    'waning gibbous': 5,
    'third quarter': 6,
    'last quarter': 6,
    'waning crescent': 7,
  };
  return mapping[phaseName?.toLowerCase()] ?? null;
};

/**
 * Get illumination value for a phase (for the graphic)
 */
const getPhaseIllumination = (phaseIndex) => {
  const illuminations = [0, 25, 50, 75, 100, 75, 50, 25];
  return illuminations[phaseIndex] ?? 50;
};

/**
 * Check if phase is waning (shadow on right side)
 */
const isPhaseWaning = (phaseIndex) => {
  return phaseIndex >= 4;
};

function MoonPage() {
  const sectionsRef = useRef([]);
  const bottomCtaRef = useRef(null);
  const [selectedPhase, setSelectedPhase] = useState(null);

  // Moon phase data (no location needed - phase/illumination are global)
  const { todayPhase, isLoading: moonLoading } = useTodayMoonPhase();

  // Memoized display values
  const displayData = useMemo(() => {
    const currentPhaseIndex = todayPhase ? getPhaseIndex(todayPhase.phase_name) : null;
    return {
      phaseName: todayPhase?.phase_name || null,
      illumination: todayPhase?.illumination ?? null,
      rotationAngle: todayPhase?.rotation_angle ?? 0,
      isWaning: todayPhase?.is_waning ?? false,
      phaseIndex: currentPhaseIndex,
      date: formatDate(),
    };
  }, [todayPhase]);

  // Current phase data
  const currentPhaseData = displayData.phaseIndex !== null ? MOON_PHASES[displayData.phaseIndex] : null;

  // Displayed phase: selected > current > default to new moon
  const displayedPhaseIndex = selectedPhase ?? displayData.phaseIndex ?? 0;
  const displayedPhase = MOON_PHASES[displayedPhaseIndex];

  // Scroll-triggered animations using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains('moon-bottom')) {
              entry.target.classList.add('moon-bottom--visible');
            } else {
              entry.target.classList.add('moon-section--visible');
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    sectionsRef.current.forEach((el) => {
      if (el && !el.classList.contains('moon-section--visible')) {
        observer.observe(el);
      }
    });

    if (bottomCtaRef.current && !bottomCtaRef.current.classList.contains('moon-bottom--visible')) {
      observer.observe(bottomCtaRef.current);
    }

    return () => observer.disconnect();
  }, [currentPhaseData]);

  useSEO({
    title: 'Understanding Moon Phases | Starview',
    description: 'Learn how the Moon\'s 8 phases affect stargazing conditions. Plan your observing sessions around the lunar cycle for the best views of the night sky.',
    path: '/moon',
  });

  return (
    <div className="moon-page">
      {/* Observatory-Style Hero Section */}
      <header className="moon-hero">
        {/* Grid overlay */}
        <div className="moon-hero__grid" aria-hidden="true" />

        {/* Scan line effect */}
        <div className="moon-hero__scanline" aria-hidden="true" />

        {/* Corner brackets */}
        <svg className="moon-hero__bracket moon-hero__bracket--tl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 40 L0 0 L40 0" fill="none" strokeWidth="2" />
        </svg>
        <svg className="moon-hero__bracket moon-hero__bracket--tr" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L40 0 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="moon-hero__bracket moon-hero__bracket--bl" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M0 0 L0 40 L40 40" fill="none" strokeWidth="2" />
        </svg>
        <svg className="moon-hero__bracket moon-hero__bracket--br" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M40 0 L40 40 L0 40" fill="none" strokeWidth="2" />
        </svg>

        {/* Status bar (top) */}
        <div className="moon-hero__status-bar">
          <div className="moon-hero__status">
            <span className="moon-hero__status-dot" />
            <span className="moon-hero__status-text">REFERENCE</span>
          </div>
          <span className="moon-hero__status-label">LUNAR CYCLES</span>
          <span className="moon-hero__status-date">{displayData.date}</span>
        </div>

        {/* Main content */}
        <div className="moon-hero__content">
          <h1 className="moon-hero__title">
            Understanding Moon Phases
          </h1>
          <p className="moon-hero__text">
            The Moon's illumination cycle affects what you can see in the night sky.
            Learn how to plan your stargazing sessions around the lunar calendar.
          </p>
        </div>

        {/* Today's moon data strip (bottom) */}
        <div className="moon-hero__data-strip">
          {displayData.phaseName ? (
            <>
              <div className="moon-hero__data-item moon-hero__data-item--highlight">
                <span className="moon-hero__data-label">TONIGHT</span>
                <span className="moon-hero__data-value moon-hero__data-value--large">
                  {displayData.phaseName}
                </span>
              </div>
              <div className="moon-hero__data-item moon-hero__data-item--highlight">
                <span className="moon-hero__data-label">ILLUMINATION</span>
                <span className="moon-hero__data-value moon-hero__data-value--large">
                  {Math.round(displayData.illumination)}%
                </span>
              </div>
            </>
          ) : (
            <div className="moon-hero__data-item moon-hero__data-item--empty">
              <span className="moon-hero__data-label">TONIGHT</span>
              <span className="moon-hero__data-value">
                {moonLoading ? 'Loading...' : 'Loading...'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Interactive Phase Scale Section */}
      <section className="moon-section moon-scale-section" ref={(el) => (sectionsRef.current[0] = el)}>
        <div className="moon-section__header">
          <span className="moon-section__eyebrow">Interactive Guide</span>
          <h2 className="moon-section__title">The 8 Moon Phases</h2>
          <p className="moon-section__subtitle">
            Tap or hover on a phase to learn about its impact on stargazing
          </p>
        </div>

        <div className="moon-scale">
          <div className="moon-scale__phases">
            {MOON_PHASES.map((phase, index) => (
              <div
                key={phase.id}
                className={`moon-scale__phase ${
                  displayedPhaseIndex === index ? 'moon-scale__phase--selected' : ''
                } ${displayData.phaseIndex === index ? 'moon-scale__phase--current' : ''}`}
                onMouseEnter={() => setSelectedPhase(index)}
                onMouseLeave={() => setSelectedPhase(null)}
                onClick={() => setSelectedPhase(index === selectedPhase ? null : index)}
                role="button"
                tabIndex={0}
                aria-label={`${phase.name}: ${phase.stargazing.rating} for stargazing`}
                style={{ '--phase-delay': `${0.05 * index}s` }}
              >
                {displayData.phaseIndex === index && (
                  <span className="moon-scale__phase-marker">NOW</span>
                )}
                <div className="moon-scale__phase-graphic">
                  <MoonPhaseGraphic
                    illumination={getPhaseIllumination(index)}
                    isWaning={isPhaseWaning(index)}
                    size={48}
                  />
                </div>
                <span className="moon-scale__phase-number">{index + 1}</span>
              </div>
            ))}
          </div>

          <div className="moon-scale__labels">
            <span>New</span>
            <span>Full</span>
            <span>New</span>
          </div>

          {/* Info panel - always visible */}
          <div className="moon-scale__info moon-scale__info--visible">
            <div className="moon-scale__info-header">
              <span className={`moon-scale__info-quality moon-scale__info-quality--${displayedPhase.stargazing.quality}`}>
                {displayedPhase.stargazing.rating}
              </span>
              <h3 className="moon-scale__info-name">{displayedPhase.name}</h3>
            </div>
            <p className="moon-scale__info-desc">{displayedPhase.description}</p>
            <div className="moon-scale__info-tips">
              <i className="fa-solid fa-lightbulb" />
              <span>{displayedPhase.stargazing.tips[0]}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Moon Visualization Section */}
      <section className="moon-section moon-live-section" ref={(el) => (sectionsRef.current[1] = el)}>
        <div className="moon-section__header">
          <span className="moon-section__eyebrow">Current Conditions</span>
          <h2 className="moon-section__title">Tonight's Moon</h2>
          <p className="moon-section__subtitle">
            Real-time lunar data for tonight
          </p>
        </div>

        <div className="moon-live">
          <div className="moon-live__graphic">
            <MoonPhaseGraphic
              illumination={displayData.illumination ?? 0}
              isWaning={displayData.isWaning}
              rotationAngle={displayData.rotationAngle}
              size={180}
            />
          </div>

          <div className="moon-live__details">
            <div className="moon-live__phase">
              <span className="moon-live__phase-name">
                {displayData.phaseName || 'Loading...'}
              </span>
              <span className="moon-live__phase-illumination">
                {displayData.illumination !== null ? `${Math.round(displayData.illumination)}% illuminated` : ''}
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* Stargazing Guide Section (4 Tier Cards) */}
      <section className="moon-section moon-guide-section" ref={(el) => (sectionsRef.current[2] = el)}>
        <div className="moon-section__header">
          <span className="moon-section__eyebrow">Stargazing Guide</span>
          <h2 className="moon-section__title">Plan Around the Moon</h2>
          <p className="moon-section__subtitle">
            Different phases offer different opportunities
          </p>
        </div>

        <div className="moon-guide">
          {STARGAZING_TIERS.map((tier) => (
            <div key={tier.tier} className={`moon-guide__tier moon-guide__tier--${tier.color}`}>
              <div className="moon-guide__tier-header">
                <div className="moon-guide__tier-badge">
                  <i className={`fa-solid ${tier.icon}`} />
                </div>
                <div>
                  <h3 className="moon-guide__tier-title">{tier.label}</h3>
                  <span className="moon-guide__tier-phases">{tier.phases.join(', ')}</span>
                </div>
              </div>
              <p className="moon-guide__tier-desc">{tier.description}</p>
              <ul className="moon-guide__list">
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
      <section className="moon-section moon-tips-section" ref={(el) => (sectionsRef.current[3] = el)}>
        <div className="moon-section__header">
          <span className="moon-section__eyebrow">Practical Advice</span>
          <h2 className="moon-section__title">Timing Your Sessions</h2>
        </div>

        <div className="moon-tips">
          {/* Hero card - spans 2 rows */}
          <div className="moon-tips__card moon-tips__card--hero">
            <div className="moon-tips__icon moon-tips__icon--large">
              <i className="fa-solid fa-calendar-days" />
            </div>
            <h3 className="moon-tips__title">29.5 Day Cycle</h3>
            <p className="moon-tips__text">
              The Moon completes a full phase cycle in about 29.5 days. Plan your most ambitious
              deep-sky observations around the new moon, when skies are darkest.
            </p>
            <div className="moon-tips__stat">
              <span className="moon-tips__stat-value">~7</span>
              <span className="moon-tips__stat-label">dark nights per month</span>
            </div>
          </div>

          <div className="moon-tips__card">
            <div className="moon-tips__icon">
              <i className="fa-solid fa-arrow-down" />
            </div>
            <h3 className="moon-tips__title">First Quarter Strategy</h3>
            <p className="moon-tips__text">
              The First Quarter moon sets around midnight. Plan deep-sky sessions for the second half of the night.
            </p>
          </div>

          <div className="moon-tips__card">
            <div className="moon-tips__icon">
              <i className="fa-solid fa-arrow-up" />
            </div>
            <h3 className="moon-tips__title">Third Quarter Strategy</h3>
            <p className="moon-tips__text">
              The Third Quarter moon rises around midnight. Observe in the early evening for dark skies.
            </p>
          </div>

          {/* Wide card - spans 2 columns */}
          <div className="moon-tips__card moon-tips__card--wide">
            <div className="moon-tips__icon">
              <i className="fa-solid fa-globe" />
            </div>
            <div className="moon-tips__content">
              <h3 className="moon-tips__title">Hemisphere Differences</h3>
              <p className="moon-tips__text">
                In the Northern Hemisphere, the Moon waxes (grows) from right to left.
                In the Southern Hemisphere, it's reversed—the Moon waxes from left to right.
                The rotation angle also differs based on your latitude.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="moon-bottom" ref={bottomCtaRef}>
        <h2 className="moon-bottom__title">Check Tonight's Moon</h2>
        <p className="moon-bottom__text">
          See real-time moon data, rise and set times, and stargazing conditions for your location.
        </p>
        <Link to="/tonight" className="moon-bottom__cta">
          <span className="moon-bottom__cta-label">Tonight</span>
          View Tonight's Sky
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>

      {/* Back Link */}
      <nav className="moon-back">
        <Link to="/sky" className="moon-back__link">
          <i className="fa-solid fa-arrow-left" />
          Back to Sky Conditions
        </Link>
      </nav>
    </div>
  );
}

export default MoonPage;
