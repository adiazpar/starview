/* LocationStats Component
 * Prominent stats row displayed between hero and description.
 * Shows: Bortle Class, Elevation, Location Type, Tonight's Score
 */

import { useMemo } from 'react';
import { useNighttimeWeather } from '../../../hooks/useNighttimeWeather';
import { useMoonPhases } from '../../../hooks/useMoonPhases';
import { useUnits } from '../../../hooks/useUnits';
import './styles.css';

// Location type display names and icons
const LOCATION_TYPES = {
  observatory: { label: 'Observatory', icon: 'fa-solid fa-tower-observation' },
  dark_sky_site: { label: 'Dark Sky Site', icon: 'fa-solid fa-moon' },
  campground: { label: 'Campground', icon: 'fa-solid fa-campground' },
  viewpoint: { label: 'Viewpoint', icon: 'fa-solid fa-binoculars' },
  other: { label: 'Location', icon: 'fa-solid fa-location-dot' },
};

// Bortle score mapping (same as Tonight page)
const BORTLE_SCORE_MAP = {
  1: 100, 2: 100, 3: 85, 4: 70, 5: 50, 6: 35, 7: 20, 8: 5, 9: 0,
};

// Calculate tonight's viewing score (same formula as Tonight page)
const calculateTonightScore = (moonIllumination, bortleClass, cloudCover) => {
  const scores = [];
  const weights = [];

  // Moon score: 100% at new moon, 0% at full moon
  if (moonIllumination !== null && moonIllumination !== undefined) {
    scores.push(100 - moonIllumination);
    weights.push(40);
  }

  // Bortle score from mapping
  if (bortleClass && BORTLE_SCORE_MAP[bortleClass] !== undefined) {
    scores.push(BORTLE_SCORE_MAP[bortleClass]);
    weights.push(30);
  }

  // Weather score: 100% for clear, 0% for overcast
  if (cloudCover !== null && cloudCover !== undefined) {
    scores.push(100 - cloudCover);
    weights.push(30);
  }

  if (scores.length === 0) return null;

  // Weighted average
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
  return Math.round(weightedSum / totalWeight);
};

// Format today's date as YYYY-MM-DD
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function LocationStats({ location }) {
  const { formatElevation } = useUnits();
  const today = formatLocalDate(new Date());

  // Fetch moon data for tonight
  const { data: moonData } = useMoonPhases({
    startDate: today,
    endDate: today,
    lat: location.latitude,
    lng: location.longitude,
    enabled: !!location.latitude && !!location.longitude,
  });

  // Fetch weather data for tonight
  const { data: weatherData } = useNighttimeWeather({
    lat: location.latitude,
    lng: location.longitude,
    enabled: !!location.latitude && !!location.longitude,
  });

  // Calculate tonight's score
  const tonightScore = useMemo(() => {
    const moonIllumination = moonData?.phases?.[0]?.illumination;
    const cloudCover = weatherData?.nighttimeAverages?.cloudCover;
    return calculateTonightScore(moonIllumination, location.bortle_class, cloudCover);
  }, [moonData, weatherData, location.bortle_class]);

  // Get location type info
  const locationType = LOCATION_TYPES[location.location_type] || LOCATION_TYPES.other;

  return (
    <div className="location-stats">
      {/* Bortle Class - Sky Darkness */}
      <div className="location-stats__item">
        <div className="location-stats__value">
          <span className="location-stats__number">
            {location.bortle_class ? `B${location.bortle_class}` : '—'}
          </span>
        </div>
        <div className="location-stats__label">Sky Darkness</div>
      </div>

      {/* Elevation */}
      <div className="location-stats__item">
        <div className="location-stats__value">
          <span className="location-stats__number">
            {location.elevation ? formatElevation(location.elevation) : '—'}
          </span>
        </div>
        <div className="location-stats__label">Elevation</div>
      </div>

      {/* Location Type */}
      <div className="location-stats__item">
        <div className="location-stats__value">
          <span className="location-stats__number">{locationType.label}</span>
        </div>
        <div className="location-stats__label">Type</div>
      </div>

      {/* Tonight's Score */}
      <div className="location-stats__item">
        <div className="location-stats__value">
          <span className="location-stats__number">
            {tonightScore !== null ? `${tonightScore}%` : '—'}
          </span>
        </div>
        <div className="location-stats__label">Tonight's Score</div>
      </div>
    </div>
  );
}

export default LocationStats;
