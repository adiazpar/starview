/* Tonight's Stargazing Conditions
 * Mission Control-style dashboard answering "Should I go stargazing tonight?"
 * Hero Sky Score with supporting cards for Moon, Weather, and Light Pollution.
 */

import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMoonPhases } from '../../hooks/useMoonPhases';
import { useWeather } from '../../hooks/useWeather';
import { useBortle } from '../../hooks/useBortle';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useAuth } from '../../context/AuthContext';
import { useSEO } from '../../hooks/useSEO';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import WeatherGraphic from '../../components/shared/WeatherGraphic';
import './styles.css';

/**
 * Calculate component scores and total sky score
 */
const calculateScores = (illumination, bortleClass, cloudCover) => {
  // Moon score: 100% at new moon (0% illumination), 0% at full moon
  const moon = illumination !== null && illumination !== undefined
    ? Math.round(100 - illumination)
    : null;

  // Bortle score: Darker skies = higher score
  const bortleScoreMap = {
    1: 100, 2: 100, 3: 85, 4: 70, 5: 50, 6: 35, 7: 20, 8: 5, 9: 0,
  };
  const bortle = bortleClass !== null && bortleClass !== undefined
    ? bortleScoreMap[bortleClass] ?? 0
    : null;

  // Weather score: Clear skies = higher score
  const weather = cloudCover !== null && cloudCover !== undefined
    ? Math.round(100 - cloudCover)
    : null;

  // Weighted total (40% moon, 30% bortle, 30% weather)
  let total = null;
  let availableWeight = 0;
  let weightedSum = 0;

  if (moon !== null) { weightedSum += moon * 0.4; availableWeight += 0.4; }
  if (bortle !== null) { weightedSum += bortle * 0.3; availableWeight += 0.3; }
  if (weather !== null) { weightedSum += weather * 0.3; availableWeight += 0.3; }

  if (availableWeight > 0) {
    total = Math.round(weightedSum / availableWeight);
  }

  return { moon, bortle, weather, total };
};

/**
 * Get quality rating from score
 */
const getQuality = (score) => {
  if (score >= 80) return { label: 'Excellent', class: 'excellent', message: 'Perfect night for stargazing' };
  if (score >= 60) return { label: 'Good', class: 'good', message: 'Good conditions for stargazing tonight' };
  if (score >= 40) return { label: 'Fair', class: 'fair', message: 'Moderate conditions - best for bright objects' };
  return { label: 'Poor', class: 'poor', message: 'Challenging conditions tonight' };
};

/**
 * Format time string (HH:MM) to display format (e.g., "8:30 PM")
 */
const formatTime = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

/**
 * Convert moonrise/moonset event to a comparable timestamp
 * Returns milliseconds since epoch for comparison
 */
const eventToTimestamp = (event) => {
  if (!event?.time) return Infinity;
  const [hours, minutes] = event.time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  // If event is tomorrow, add a day
  if (event.label?.toLowerCase() === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
};

/**
 * Get moon events sorted by which happens next
 */
const getSortedMoonEvents = (moonData) => {
  const events = [];

  if (moonData?.next_moonrise) {
    events.push({
      type: 'rise',
      label: 'Rise',
      time: moonData.next_moonrise.time,
      dayLabel: moonData.next_moonrise.label,
      timestamp: eventToTimestamp(moonData.next_moonrise),
    });
  }

  if (moonData?.next_moonset) {
    events.push({
      type: 'set',
      label: 'Set',
      time: moonData.next_moonset.time,
      dayLabel: moonData.next_moonset.label,
      timestamp: eventToTimestamp(moonData.next_moonset),
    });
  }

  // Sort by timestamp (soonest first)
  return events.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Get Bortle class description
 */
const getBortleDescription = (bortleClass) => {
  const descriptions = {
    1: 'Excellent dark-sky site',
    2: 'Truly dark site',
    3: 'Rural sky',
    4: 'Rural/suburban transition',
    5: 'Suburban sky',
    6: 'Bright suburban sky',
    7: 'Suburban/urban transition',
    8: 'City sky',
    9: 'Inner-city sky',
  };
  return descriptions[bortleClass] || 'Unknown';
};

/**
 * Get weather condition description from cloud cover
 */
const getWeatherDescription = (cloudCover) => {
  if (cloudCover === null || cloudCover === undefined) return { label: '--', description: 'No data' };
  if (cloudCover <= 10) return { label: 'Clear', description: 'Excellent visibility' };
  if (cloudCover <= 25) return { label: 'Mostly Clear', description: 'Good visibility' };
  if (cloudCover <= 50) return { label: 'Partly Cloudy', description: 'Some obstructions' };
  if (cloudCover <= 75) return { label: 'Mostly Cloudy', description: 'Limited visibility' };
  return { label: 'Overcast', description: 'Poor visibility' };
};

/**
 * Inner component - renders when location is resolved
 */
function TonightContent({
  lat,
  lng,
  location,
  source,
  user,
  permissionState,
  isAuthenticated,
  onEnableLocation,
}) {
  // Today's date
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Fetch moon data
  const { current: moonData, isLoading: moonLoading } = useMoonPhases({
    startDate: dateStr,
    endDate: dateStr,
    lat,
    lng,
    suspense: false,
    refetchInterval: 60000,
  });

  // Fetch Bortle and weather
  const { bortle, isLoading: bortleLoading } = useBortle({
    lat,
    lng,
    enabled: lat !== undefined && lng !== undefined,
  });

  const {
    cloudCover,
    precipitationType,
    precipitationProbability,
    humidity,
    windSpeed,
    temperature,
    isLoading: weatherLoading,
  } = useWeather({
    lat,
    lng,
    date: today,
    enabled: lat !== undefined && lng !== undefined,
  });

  // Calculate scores
  const scores = useMemo(() => {
    return calculateScores(moonData?.illumination, bortle, cloudCover);
  }, [moonData?.illumination, bortle, cloudCover]);

  const quality = scores.total !== null ? getQuality(scores.total) : null;
  const weatherInfo = getWeatherDescription(cloudCover);
  const isLoading = moonLoading || bortleLoading || weatherLoading;

  // SVG ring parameters
  const ringSize = 200;
  const strokeWidth = 10;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animate ring and score from 0 to actual value on load
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);
  const targetProgress = scores.total !== null ? scores.total / 100 : 0;
  const targetScore = scores.total ?? 0;

  useEffect(() => {
    if (!isLoading && scores.total !== null) {
      // Small delay to ensure CSS transition kicks in
      const timer = setTimeout(() => {
        setAnimatedProgress(targetProgress);

        // Animate the score number counting up
        const duration = 1000; // Match CSS transition duration
        const startTime = performance.now();

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease-out curve to match CSS transition
          const easeOut = 1 - Math.pow(1 - progress, 3);
          setAnimatedScore(Math.round(easeOut * targetScore));

          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading, scores.total, targetProgress, targetScore]);

  const strokeDashoffset = circumference * (1 - animatedProgress);

  return (
    <main className="tonight-page">
      {/* Header */}
      <header className="tonight-header">
        <h1 className="tonight-header__title">Tonight&apos;s Sky</h1>
        <p className="tonight-header__subtitle">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      {/* Hero: Sky Score */}
      <section className="tonight-hero">
        <div className="tonight-hero__score-container">
          {isLoading ? (
            <div className="tonight-hero__loading">
              <div className="tonight-hero__loading-ring"></div>
            </div>
          ) : (lat !== undefined && scores.total !== null) ? (
            <>
              <svg
                className="tonight-hero__ring"
                viewBox={`0 0 ${ringSize} ${ringSize}`}
              >
                <circle
                  className="tonight-hero__ring-track"
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={strokeWidth}
                />
                <circle
                  className={`tonight-hero__ring-progress tonight-hero__ring-progress--${quality.class}`}
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </svg>
              <div className="tonight-hero__score-content">
                <span className="tonight-hero__score-value">{animatedScore}</span>
                <span className={`tonight-hero__score-label tonight-hero__score-label--${quality.class}`}>
                  {quality.label}
                </span>
              </div>
            </>
          ) : (
            <div className="tonight-hero__no-data">
              <span className="tonight-hero__no-data-icon">?</span>
              <span className="tonight-hero__no-data-text">No Data</span>
            </div>
          )}
        </div>

        {lat !== undefined && location && !isLoading && (
          <p className="tonight-hero__location">
            <i className="fa-solid fa-location-dot"></i>
            <span>{source === 'profile' && user?.location ? user.location : 'Your Location'}</span>
          </p>
        )}

        {/* Location prompt for users without location */}
        {lat === undefined && !isLoading && (
          <div className="tonight-hero__location-prompt">
            {permissionState === 'denied' ? (
              <p>
                Location access was blocked. Enable it in your browser settings
                {isAuthenticated ? (
                  <> or <Link to="/profile?scrollTo=location">set your location</Link> in settings.</>
                ) : (
                  <> or <Link to="/login?next=/tonight">sign in</Link> to set your preferred location.</>
                )}
              </p>
            ) : (
              <p>
                <button className="tonight-hero__enable-btn" onClick={onEnableLocation}>
                  Enable location
                </button>
                {' '}to see tonight&apos;s conditions
                {isAuthenticated ? (
                  <>, or <Link to="/profile?scrollTo=location">set it in settings</Link>.</>
                ) : (
                  <>, or <Link to="/login?next=/tonight">sign in</Link> to save your preferred location.</>
                )}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Condition Cards */}
      {lat !== undefined && (
        <section className="tonight-cards">
          <div className="tonight-cards__grid">
            {/* Moon Card */}
            <div className="tonight-card tonight-card--moon">
              <div className="tonight-card__header">
                <div className="tonight-card__icon">
                  <MoonPhaseGraphic
                    illumination={moonData?.illumination ?? 50}
                    isWaning={moonData?.is_waning ?? false}
                    rotationAngle={moonData?.rotation_angle ?? 0}
                    size={32}
                  />
                </div>
                <div className="tonight-card__title">Moon</div>
              </div>

              <div className="tonight-card__body">
                <div className="tonight-card__primary">
                  <span className="tonight-card__value">
                    {moonData?.illumination?.toFixed(1) ?? '--'}%
                  </span>
                  <span className="tonight-card__label">Illuminated</span>
                </div>

                <div className="tonight-card__condition">
                  <span className="tonight-card__condition-label">{moonData?.phase_name || 'Loading...'}</span>
                  <span className="tonight-card__condition-desc">Moon phase</span>
                </div>

                <div className="tonight-card__times">
                  {getSortedMoonEvents(moonData).map((event) => (
                    <div key={event.type} className="tonight-card__time">
                      <span className="tonight-card__time-label">{event.label}</span>
                      <span className="tonight-card__time-value">
                        {formatTime(event.time)}
                      </span>
                      {event.dayLabel && (
                        <span className="tonight-card__time-day">{event.dayLabel}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="tonight-card__footer">
                <div className="tonight-card__score">
                  <span className="tonight-card__score-value">{scores.moon ?? '--'}%</span>
                  <span className="tonight-card__score-label">Score</span>
                </div>
              </div>
            </div>

            {/* Weather Card */}
            <div className="tonight-card tonight-card--weather">
              <div className="tonight-card__header">
                <div className="tonight-card__icon tonight-card__icon--weather">
                  <WeatherGraphic
                    cloudCover={cloudCover}
                    precipitationType={precipitationType}
                    precipitationProbability={precipitationProbability}
                    size={32}
                  />
                </div>
                <div className="tonight-card__title">Weather</div>
              </div>

              <div className="tonight-card__body">
                <div className="tonight-card__primary">
                  <span className="tonight-card__value">
                    {cloudCover !== null && cloudCover !== undefined ? `${Math.round(cloudCover)}%` : '--'}
                  </span>
                  <span className="tonight-card__label">Cloud Cover</span>
                </div>

                <div className="tonight-card__condition">
                  <span className="tonight-card__condition-label">{weatherInfo.label}</span>
                  <span className="tonight-card__condition-desc">{weatherInfo.description}</span>
                </div>

                <div className="tonight-card__meta">
                  <div className="tonight-card__meta-item">
                    <span className="tonight-card__meta-label">Humidity</span>
                    <span className="tonight-card__meta-value">
                      {humidity !== null ? `${Math.round(humidity)}%` : '--'}
                    </span>
                  </div>
                  <div className="tonight-card__meta-item">
                    <span className="tonight-card__meta-label">Wind</span>
                    <span className="tonight-card__meta-value">
                      {windSpeed !== null ? `${Math.round(windSpeed)} km/h` : '--'}
                    </span>
                  </div>
                  <div className="tonight-card__meta-item">
                    <span className="tonight-card__meta-label">Temp</span>
                    <span className="tonight-card__meta-value">
                      {temperature !== null ? `${Math.round(temperature)}°C` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="tonight-card__footer">
                <div className="tonight-card__score">
                  <span className="tonight-card__score-value">{scores.weather ?? '--'}%</span>
                  <span className="tonight-card__score-label">Score</span>
                </div>
              </div>
            </div>

            {/* Darkness/Bortle Card */}
            <div className="tonight-card tonight-card--darkness">
              <div className="tonight-card__header">
                <div className="tonight-card__icon tonight-card__icon--darkness">
                  <i className="fa-solid fa-eye"></i>
                </div>
                <div className="tonight-card__title">Darkness</div>
              </div>

              <div className="tonight-card__body">
                <div className="tonight-card__primary">
                  <span className="tonight-card__value tonight-card__value--bortle">
                    {bortle ?? '--'}
                  </span>
                  <span className="tonight-card__label">Bortle Class</span>
                </div>

                <div className="tonight-card__condition">
                  <span className="tonight-card__condition-label">
                    {bortle ? getBortleDescription(bortle) : 'Loading...'}
                  </span>
                  <span className="tonight-card__condition-desc">Light pollution level</span>
                </div>

                <div className="tonight-card__meta tonight-card__meta--cta">
                  <Link to="/explore?view=map&lightPollution=true" className="tonight-card__cta">
                    <span>Find Darker Skies</span>
                    <i className="fa-solid fa-arrow-right"></i>
                  </Link>
                </div>
              </div>

              <div className="tonight-card__footer">
                <div className="tonight-card__score">
                  <span className="tonight-card__score-value">{scores.bortle ?? '--'}%</span>
                  <span className="tonight-card__score-label">Score</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tip Section */}
      <section className="tonight-tip">
        <div className="tonight-tip__card">
          <div className="tonight-tip__icon">
            <i className="fa-solid fa-lightbulb"></i>
          </div>
          <div className="tonight-tip__content">
            <h3 className="tonight-tip__title">Understanding Your Score</h3>
            <p className="tonight-tip__text">
              Your sky score combines three factors: <strong>Moon brightness</strong> (40%) determines
              how washed out the sky will be, <strong>light pollution</strong> (30%) at your location
              affects what you can see, and <strong>cloud cover</strong> (30%) impacts visibility.
              Scores above 70 are ideal for viewing faint objects like nebulae and galaxies.
            </p>
          </div>
        </div>
      </section>

      {/* Back Link */}
      <nav className="tonight-back">
        <Link to="/sky" className="tonight-back__link">
          <i className="fa-solid fa-arrow-left" />
          Back to Sky Conditions
        </Link>
      </nav>
    </main>
  );
}

/**
 * Main page component - handles location loading state
 */
function TonightPage() {
  useSEO({
    title: "Tonight's Sky Conditions | Starview",
    description: "Should you go stargazing tonight? Check real-time sky conditions including moon phase, weather, and light pollution at your location.",
    path: '/tonight',
  });

  const {
    location,
    isLoading: locationLoading,
    permissionState,
    source,
    refresh: refreshLocation,
  } = useUserLocation();
  const { isAuthenticated, user } = useAuth();

  const lat = location?.latitude;
  const lng = location?.longitude;

  // Loading state while location resolves
  if (locationLoading) {
    return (
      <main className="tonight-page tonight-page--loading">
        <header className="tonight-header">
          <h1 className="tonight-header__title">Tonight&apos;s Sky</h1>
          <p className="tonight-header__subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </header>

        <section className="tonight-hero">
          <div className="tonight-hero__score-container">
            <div className="tonight-hero__loading">
              <div className="tonight-hero__loading-ring"></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <TonightContent
      lat={lat}
      lng={lng}
      location={location}
      source={source}
      user={user}
      permissionState={permissionState}
      isAuthenticated={isAuthenticated}
      onEnableLocation={refreshLocation}
    />
  );
}

export default TonightPage;
