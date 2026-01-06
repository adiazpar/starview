/* Moon Phase Page
 * Observatory-style lunar data display for stargazing planning.
 * Features current phase, weekly forecast, and key dates.
 */

import { useMemo } from 'react';
import {
  useTodayMoonPhase,
  useWeeklyMoonPhases,
  useMoonPhases,
} from '../../hooks/useMoonPhases';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

function MoonPhasePage() {
  // Fetch moon data
  const { todayPhase, keyDates, isLoading: todayLoading } = useTodayMoonPhase();
  const { phases: weeklyPhases, isLoading: weeklyLoading } = useWeeklyMoonPhases();

  // Get upcoming key dates for the next 60 days
  const today = new Date();
  const sixtyDaysLater = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const { phases: upcomingKeyDates, isLoading: keyDatesLoading } = useMoonPhases({
    startDate: today.toISOString().split('T')[0],
    endDate: sixtyDaysLater.toISOString().split('T')[0],
    keyDatesOnly: true,
  });

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

  const isLoading = todayLoading || weeklyLoading || keyDatesLoading;

  if (isLoading) {
    return (
      <main className="moon-page">
        <div className="moon-page__loading">
          <LoadingSpinner />
          <p>Calculating lunar ephemeris...</p>
        </div>
      </main>
    );
  }

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
            <div className="moon-hero__emoji-container">
              <span className="moon-hero__emoji">{todayPhase?.phase_emoji}</span>
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
            </div>

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
                <span className="moon-forecast__emoji">{phase.phase_emoji}</span>
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
            {/* Next New Moon */}
            {keyDates?.next_new_moon && (
              <div className="moon-event">
                <div className="moon-event__icon">
                  <span>🌑</span>
                </div>
                <div className="moon-event__content">
                  <span className="moon-event__name">New Moon</span>
                  <span className="moon-event__date">
                    {formatDate(keyDates.next_new_moon)}
                  </span>
                </div>
                <div className="moon-event__countdown">
                  {daysUntil(keyDates.next_new_moon)}
                </div>
              </div>
            )}

            {/* Next First Quarter */}
            {keyDates?.next_first_quarter && (
              <div className="moon-event">
                <div className="moon-event__icon">
                  <span>🌓</span>
                </div>
                <div className="moon-event__content">
                  <span className="moon-event__name">First Quarter</span>
                  <span className="moon-event__date">
                    {formatDate(keyDates.next_first_quarter)}
                  </span>
                </div>
                <div className="moon-event__countdown">
                  {daysUntil(keyDates.next_first_quarter)}
                </div>
              </div>
            )}

            {/* Next Full Moon */}
            {keyDates?.next_full_moon && (
              <div className="moon-event">
                <div className="moon-event__icon moon-event__icon--full">
                  <span>🌕</span>
                </div>
                <div className="moon-event__content">
                  <span className="moon-event__name">Full Moon</span>
                  <span className="moon-event__date">
                    {formatDate(keyDates.next_full_moon)}
                  </span>
                </div>
                <div className="moon-event__countdown">
                  {daysUntil(keyDates.next_full_moon)}
                </div>
              </div>
            )}

            {/* Next Last Quarter */}
            {keyDates?.next_last_quarter && (
              <div className="moon-event">
                <div className="moon-event__icon">
                  <span>🌗</span>
                </div>
                <div className="moon-event__content">
                  <span className="moon-event__name">Last Quarter</span>
                  <span className="moon-event__date">
                    {formatDate(keyDates.next_last_quarter)}
                  </span>
                </div>
                <div className="moon-event__countdown">
                  {daysUntil(keyDates.next_last_quarter)}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Phase Calendar - Upcoming Key Dates */}
      {upcomingKeyDates && upcomingKeyDates.length > 0 && (
        <section className="moon-calendar">
          <div className="moon-calendar__container">
            <div className="moon-calendar__header">
              <span className="moon-calendar__label">60-Day Outlook</span>
              <h2 className="moon-calendar__title">Lunar Calendar</h2>
            </div>

            <div className="moon-calendar__timeline">
              {upcomingKeyDates.map((event, index) => (
                <div
                  key={`${event.date}-${event.phase_name}`}
                  className="moon-calendar__event"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="moon-calendar__date">
                    <span className="moon-calendar__date-day">
                      {new Date(event.date + 'T00:00:00').getDate()}
                    </span>
                    <span className="moon-calendar__date-month">
                      {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <div className="moon-calendar__line"></div>
                  <div className="moon-calendar__details">
                    <span className="moon-calendar__emoji">{event.phase_emoji}</span>
                    <span className="moon-calendar__name">{event.phase_name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
