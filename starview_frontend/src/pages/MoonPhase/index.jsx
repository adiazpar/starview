/* Moon Phase Page
 * Observatory-style lunar data display for stargazing planning.
 * Features current phase, weekly forecast, and key dates.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useTodayMoonPhase,
  useWeeklyMoonPhases,
} from '../../hooks/useMoonPhases';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useAuth } from '../../context/AuthContext';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import './styles.css';

function MoonPhasePage() {
  // Get user location for moonrise/moonset calculations
  const {
    location,
    isLoading: locationLoading,
    permissionState,
    source,
    refresh: refreshLocation,
  } = useUserLocation();
  const { isAuthenticated, user } = useAuth();

  // Extract lat/lng if available
  const lat = location?.latitude;
  const lng = location?.longitude;

  // Handle location permission request
  const handleEnableLocation = () => {
    // This will trigger a browser permission prompt
    refreshLocation();
  };

  // Fetch moon data (with location for moonrise/moonset if available)
  // Using suspense mode so React Suspense boundary handles loading
  // Real-time updates every 60 seconds for live moon tracking
  const { todayPhase, keyDates } = useTodayMoonPhase({
    lat,
    lng,
    suspense: true,
    refetchInterval: 60000, // Update every minute
  });
  const { phases: weeklyPhases } = useWeeklyMoonPhases({ lat, lng, suspense: true });

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get day name
  const getDayName = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Calculate days until a date
  const daysUntil = (dateStr) => {
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffTime = target - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  // Best stargazing nights from weekly forecast
  const bestNights = useMemo(() => {
    if (!weeklyPhases) return [];
    return weeklyPhases.filter((p) => p.is_good_for_stargazing);
  }, [weeklyPhases]);

  // Format time for display (e.g., "9:47 PM")
  const formatTime = (timeStr) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <main className="moon-page">
      {/* Hero Section - Current Phase */}
      <section className="moon-hero">
        <div className="moon-hero__container">
          {/* Coordinate markers */}
          <div className="moon-hero__coords">
            <span className="moon-hero__coord">LUNAR PHASE</span>
            <span className="moon-hero__coord">
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>

          {/* Main moon display */}
          <div className="moon-hero__display">
            <div className="moon-hero__moon-container">
              <MoonPhaseGraphic
                illumination={todayPhase?.illumination ?? 50}
                isWaning={todayPhase?.is_waning ?? false}
                rotationAngle={todayPhase?.rotation_angle ?? 0}
                size={180}
                className="moon-hero__moon"
              />
              <div className="moon-hero__ring"></div>
              <div className="moon-hero__ring moon-hero__ring--outer"></div>
            </div>

            <h1 className="moon-hero__phase-name">{todayPhase?.phase_name}</h1>

            <div className="moon-hero__stats">
              <div className="moon-hero__stat">
                <span className="moon-hero__stat-value">
                  {todayPhase?.illumination?.toFixed(1)}%
                </span>
                <span className="moon-hero__stat-label">Illumination</span>
              </div>
              <div className="moon-hero__stat-divider"></div>
              <div className="moon-hero__stat">
                <span
                  className={`moon-hero__stat-value ${todayPhase?.is_good_for_stargazing ? 'moon-hero__stat-value--good' : ''}`}
                >
                  {todayPhase?.is_good_for_stargazing ? 'Optimal' : 'Bright'}
                </span>
                <span className="moon-hero__stat-label">Sky Conditions</span>
              </div>
              {/* Next Moonrise/Moonset - shown in chronological order */}
              {(() => {
                const rise = todayPhase?.next_moonrise;
                const set = todayPhase?.next_moonset;
                if (!rise && !set) return null;

                // Compare datetime to determine which comes first
                const riseDateTime = rise ? new Date(`${rise.date}T${rise.time}`) : null;
                const setDateTime = set ? new Date(`${set.date}T${set.time}`) : null;
                const moonsetFirst = setDateTime && (!riseDateTime || setDateTime < riseDateTime);

                const events = moonsetFirst
                  ? [{ ...set, type: 'Moonset' }, { ...rise, type: 'Moonrise' }]
                  : [{ ...rise, type: 'Moonrise' }, { ...set, type: 'Moonset' }];

                return events.filter(Boolean).flatMap((event) => [
                  <div key={`${event.type}-divider`} className="moon-hero__stat-divider"></div>,
                  <div key={event.type} className="moon-hero__stat">
                    <span className="moon-hero__stat-value">
                      {formatTime(event.time)}
                    </span>
                    <span className="moon-hero__stat-label">
                      {event.type} · {event.label}
                    </span>
                  </div>
                ]);
              })()}
            </div>

            {/* Location prompt - shown when no moonrise/moonset data */}
            {!todayPhase?.next_moonrise && !locationLoading && (
              <p className="moon-hero__location-notice">
                {permissionState === 'denied' ? (
                  <>
                    Location access was blocked. Enable it in your browser settings
                    {isAuthenticated ? (
                      <> or <Link to="/profile?scrollTo=location">set your location</Link> in settings.</>
                    ) : (
                      <> or <Link to="/login?next=/moon">sign in</Link> to set your preferred location.</>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="moon-hero__location-link"
                      onClick={handleEnableLocation}
                    >
                      Enable location
                    </button>
                    {' '}for moonrise/moonset times
                    {isAuthenticated ? (
                      <>, or <Link to="/profile?scrollTo=location">set it in settings</Link>.</>
                    ) : (
                      <>, or <Link to="/login?next=/moon">sign in</Link> to set your preferred location.</>
                    )}
                  </>
                )}
              </p>
            )}

            {/* Location source hint */}
            {location && (
              <p className="moon-hero__location-source">
                <i className="fa-solid fa-location-dot"></i>
                {source === 'profile' && user?.location ? (
                  <span>{user.location}</span>
                ) : (
                  <span>Your location</span>
                )}
              </p>
            )}

            {/* Stargazing indicator */}
            {todayPhase?.is_good_for_stargazing && (
              <div className="moon-hero__indicator">
                <span className="moon-hero__indicator-dot"></span>
                <span>Good for stargazing tonight</span>
              </div>
            )}
          </div>
        </div>

        {/* Decorative glow */}
        <div className="moon-hero__glow"></div>
      </section>

      {/* Weekly Forecast */}
      <section className="moon-forecast">
        <div className="moon-forecast__container">
          <div className="moon-forecast__header">
            <span className="moon-forecast__label">7-Day Forecast</span>
            <h2 className="moon-forecast__title">Lunar Trajectory</h2>
          </div>

          <div className="moon-forecast__grid">
            {weeklyPhases?.map((phase, index) => (
              <div
                key={phase.date}
                className={`moon-forecast__card ${phase.is_good_for_stargazing ? 'moon-forecast__card--optimal' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className="moon-forecast__day">{getDayName(phase.date)}</span>
                <div className="moon-forecast__moon">
                  <MoonPhaseGraphic
                    illumination={phase.illumination}
                    isWaning={phase.is_waning}
                    size={48}
                  />
                </div>
                <span className="moon-forecast__illumination">
                  {phase.illumination.toFixed(0)}%
                </span>
                {phase.is_good_for_stargazing && (
                  <span className="moon-forecast__badge">
                    <i className="fa-solid fa-star"></i>
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Best nights summary */}
          {bestNights.length > 0 && (
            <div className="moon-forecast__summary">
              <i className="fa-solid fa-telescope"></i>
              <span>
                {bestNights.length === 1
                  ? '1 optimal night'
                  : `${bestNights.length} optimal nights`}{' '}
                for stargazing this week
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Key Dates Panel */}
      <section className="moon-events">
        <div className="moon-events__container">
          <div className="moon-events__header">
            <span className="moon-events__label">Upcoming</span>
            <h2 className="moon-events__title">Key Lunar Events</h2>
          </div>

          <div className="moon-events__grid">
            {/* Sort events chronologically */}
            {keyDates && [
              { date: keyDates.next_new_moon, name: 'New Moon', illumination: 0, isWaning: false },
              { date: keyDates.next_first_quarter, name: 'First Quarter', illumination: 50, isWaning: false },
              { date: keyDates.next_full_moon, name: 'Full Moon', illumination: 100, isWaning: false },
              { date: keyDates.next_last_quarter, name: 'Last Quarter', illumination: 50, isWaning: true },
            ]
              .filter((event) => event.date)
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((event) => (
                <div key={event.name} className="moon-event">
                  <div className="moon-event__icon">
                    <MoonPhaseGraphic
                      illumination={event.illumination}
                      isWaning={event.isWaning}
                      size={48}
                    />
                  </div>
                  <div className="moon-event__content">
                    <span className="moon-event__name">{event.name}</span>
                    <span className="moon-event__date">
                      {formatDate(event.date)}
                    </span>
                  </div>
                  <div className="moon-event__countdown">
                    {daysUntil(event.date)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Info Panel */}
      <section className="moon-info">
        <div className="moon-info__container">
          <div className="moon-info__card">
            <div className="moon-info__icon">
              <i className="fa-solid fa-lightbulb"></i>
            </div>
            <div className="moon-info__content">
              <h3 className="moon-info__title">Stargazing Tip</h3>
              <p className="moon-info__text">
                The best stargazing occurs when lunar illumination is below 25%. During
                new moon phases, the darkest skies reveal fainter celestial objects like
                nebulae and distant galaxies.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default MoonPhasePage;
