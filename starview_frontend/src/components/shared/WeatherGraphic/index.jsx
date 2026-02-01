/**
 * WeatherGraphic Component
 *
 * Renders Font Awesome weather icons based on current conditions.
 * Uses cloud cover and precipitation data to determine the appropriate icon.
 */

import './styles.css';

/**
 * Determine weather condition from data
 * @param {number} cloudCover - Cloud cover percentage (0-100)
 * @param {string} precipitationType - Type of precipitation ('none', 'rain', 'snow', etc.)
 * @param {number} precipitationProbability - Probability of precipitation (0-100)
 * @returns {string} Weather condition key
 */
function getWeatherCondition(cloudCover, precipitationType, precipitationProbability) {
  // Check for precipitation first
  if (precipitationType && precipitationType !== 'none') {
    if (precipitationType === 'snow') return 'snow';
    if (precipitationType === 'rain' || precipitationType === 'frzr') return 'rain';
    if (precipitationType === 'ts' || precipitationType === 'tsra') return 'storm';
  }

  // High probability of rain
  if (precipitationProbability && precipitationProbability > 60) {
    return 'rain';
  }

  // Cloud-based conditions
  if (cloudCover === null || cloudCover === undefined) return 'cloudy';
  if (cloudCover <= 10) return 'clear';
  if (cloudCover <= 40) return 'partly-cloudy';
  if (cloudCover <= 70) return 'mostly-cloudy';
  return 'cloudy';
}

/**
 * Get Font Awesome icon class for weather condition
 * @param {string} condition - Weather condition key
 * @param {boolean} isNight - Whether it's nighttime
 * @returns {string} Font Awesome icon class
 */
function getIconClass(condition, isNight) {
  switch (condition) {
    case 'clear':
      return isNight ? 'fa-moon' : 'fa-sun';
    case 'partly-cloudy':
      return isNight ? 'fa-cloud-moon' : 'fa-cloud-sun';
    case 'mostly-cloudy':
      return 'fa-cloud';
    case 'cloudy':
      return 'fa-cloud';
    case 'rain':
      return 'fa-cloud-rain';
    case 'storm':
      return 'fa-cloud-bolt';
    case 'snow':
      return 'fa-snowflake';
    default:
      return 'fa-cloud';
  }
}

export default function WeatherGraphic({
  cloudCover = null,
  precipitationType = 'none',
  precipitationProbability = null,
  size = 64,
  className = '',
  isNight = false,
}) {
  const condition = getWeatherCondition(cloudCover, precipitationType, precipitationProbability);
  const iconClass = getIconClass(condition, isNight);

  return (
    <div
      className={`weather-graphic weather-graphic--${condition} ${className}`}
      style={{ fontSize: size }}
    >
      <i className={`fa-solid ${iconClass}`} aria-hidden="true" />
    </div>
  );
}
