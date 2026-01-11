/* Moon Phase Page
 * Observatory-style lunar data display for stargazing planning.
 * Features current phase with real-time moonrise/moonset times.
 */

import { Link } from 'react-router-dom';
import { useTodayMoonPhase } from '../../hooks/useMoonPhases';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useAuth } from '../../context/AuthContext';
import MoonPhaseGraphic from '../../components/shared/MoonPhaseGraphic';
import './styles.css';

/**
 * Inner component that fetches moon data with suspense.
 * Only rendered after location is resolved to avoid double API calls.
 */
function MoonPhaseContent({ lat, lng, permissionState, isAuthenticated, user, source, location, onEnableLocation }) {
  // Fetch moon data - only called once since location is already resolved
  const { todayPhase } = useTodayMoonPhase({
    lat,
    lng,
    suspense: true,
    refetchInterval: 60000, // Update every minute
  });

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
                    <span className="moon-hero__stat-value moon-hero__stat-value--secondary">
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
            {!todayPhase?.next_moonrise && (
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
                      onClick={onEnableLocation}
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

/**
 * Main page component that handles location loading.
 * Waits for location to resolve before rendering moon content to avoid double API calls.
 */
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

  // While location is loading, show the page skeleton
  // This prevents double API calls (one without location, one with)
  if (locationLoading) {
    return (
      <main className="moon-page">
        <section className="moon-hero">
          <div className="moon-hero__container">
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
            <div className="moon-hero__display">
              <div className="moon-hero__moon-container">
                <MoonPhaseGraphic
                  illumination={50}
                  isWaning={false}
                  rotationAngle={0}
                  size={180}
                  className="moon-hero__moon moon-hero__moon--loading"
                />
                <div className="moon-hero__ring"></div>
                <div className="moon-hero__ring moon-hero__ring--outer"></div>
              </div>
              <h1 className="moon-hero__phase-name">Loading...</h1>
            </div>
          </div>
          <div className="moon-hero__glow"></div>
        </section>
      </main>
    );
  }

  return (
    <MoonPhaseContent
      lat={lat}
      lng={lng}
      permissionState={permissionState}
      isAuthenticated={isAuthenticated}
      user={user}
      source={source}
      location={location}
      onEnableLocation={refreshLocation}
    />
  );
}

export default MoonPhasePage;
