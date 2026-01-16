/**
 * TonightScore Component
 *
 * Displays a composite stargazing score (0-100) based on:
 * - Moon illumination (40% weight)
 * - Bortle class / light pollution (30% weight)
 * - Cloud cover / weather (30% weight)
 *
 * Features circular progress display with factor breakdown.
 */

import { useMemo } from 'react';
import './styles.css';

/**
 * Calculate moon score from illumination percentage
 * 100% score at 0% illumination (new moon)
 * 0% score at 100% illumination (full moon)
 */
const calculateMoonScore = (illumination) => {
  if (illumination === null || illumination === undefined) return null;
  return Math.round(100 - illumination);
};

/**
 * Calculate Bortle score from Bortle class (1-9)
 * Class 1-2: 100% (excellent)
 * Class 3: 80%
 * Class 4: 60%
 * Class 5: 45%
 * Class 6: 30%
 * Class 7: 15%
 * Class 8-9: 0%
 */
const calculateBortleScore = (bortleClass) => {
  if (bortleClass === null || bortleClass === undefined) return null;

  const scoreMap = {
    1: 100,
    2: 100,
    3: 80,
    4: 60,
    5: 45,
    6: 30,
    7: 15,
    8: 0,
    9: 0,
  };

  return scoreMap[bortleClass] ?? 0;
};

/**
 * Calculate weather score from cloud cover percentage
 * 0% clouds = 100% score
 * 100% clouds = 0% score
 */
const calculateWeatherScore = (cloudCover) => {
  if (cloudCover === null || cloudCover === undefined) return null;
  return Math.round(100 - cloudCover);
};

/**
 * Get quality label from total score
 */
const getQualityLabel = (score) => {
  if (score >= 80) return { label: 'Excellent', className: 'excellent' };
  if (score >= 60) return { label: 'Good', className: 'good' };
  if (score >= 40) return { label: 'Fair', className: 'fair' };
  return { label: 'Poor', className: 'poor' };
};

/**
 * TonightScore Component
 *
 * @param {number} illumination - Moon illumination percentage (0-100)
 * @param {number} bortleClass - Bortle class (1-9)
 * @param {number} cloudCover - Cloud cover percentage (0-100)
 * @param {boolean} isLoading - Show loading state
 */
function TonightScore({ illumination, bortleClass, cloudCover, isLoading = false }) {
  const scores = useMemo(() => {
    const moon = calculateMoonScore(illumination);
    const bortle = calculateBortleScore(bortleClass);
    const weather = calculateWeatherScore(cloudCover);

    // Calculate weighted total (only include available factors)
    let total = null;
    let availableWeight = 0;
    let weightedSum = 0;

    if (moon !== null) {
      weightedSum += moon * 0.4;
      availableWeight += 0.4;
    }
    if (bortle !== null) {
      weightedSum += bortle * 0.3;
      availableWeight += 0.3;
    }
    if (weather !== null) {
      weightedSum += weather * 0.3;
      availableWeight += 0.3;
    }

    if (availableWeight > 0) {
      total = Math.round(weightedSum / availableWeight * 100) / 100;
      total = Math.round(total);
    }

    return { moon, bortle, weather, total };
  }, [illumination, bortleClass, cloudCover]);

  // SVG circle parameters
  const size = 140;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = scores.total !== null ? scores.total / 100 : 0;
  const strokeDashoffset = circumference * (1 - progress);

  const quality = scores.total !== null ? getQualityLabel(scores.total) : null;

  if (isLoading) {
    return (
      <div className="tonight-score tonight-score--loading">
        <div className="tonight-score__ring">
          <div className="tonight-score__loading-pulse" />
        </div>
        <div className="tonight-score__factors">
          <div className="tonight-score__factor tonight-score__factor--skeleton" />
          <div className="tonight-score__factor tonight-score__factor--skeleton" />
          <div className="tonight-score__factor tonight-score__factor--skeleton" />
        </div>
      </div>
    );
  }

  // No data available at all
  if (scores.total === null) {
    return (
      <div className="tonight-score tonight-score--empty">
        <div className="tonight-score__empty-message">
          Enable location access for stargazing conditions
        </div>
      </div>
    );
  }

  return (
    <div className="tonight-score">
      {/* Circular score display */}
      <div className="tonight-score__ring">
        <svg
          className="tonight-score__svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background track */}
          <circle
            className="tonight-score__track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            className={`tonight-score__progress tonight-score__progress--${quality.className}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>

        {/* Center content */}
        <div className="tonight-score__center">
          <span className="tonight-score__value">{scores.total}</span>
          <span className={`tonight-score__quality tonight-score__quality--${quality.className}`}>
            {quality.label}
          </span>
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="tonight-score__factors">
        <div className="tonight-score__factor">
          <span className="tonight-score__factor-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
            </svg>
          </span>
          <span className="tonight-score__factor-label">Moon</span>
          <span className="tonight-score__factor-value">
            {scores.moon !== null ? `${scores.moon}%` : '--'}
          </span>
        </div>

        <div className="tonight-score__factor">
          <span className="tonight-score__factor-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
            </svg>
          </span>
          <span className="tonight-score__factor-label">Bortle</span>
          <span className="tonight-score__factor-value">
            {scores.bortle !== null ? `${scores.bortle}%` : '--'}
          </span>
        </div>

        <div className="tonight-score__factor">
          <span className="tonight-score__factor-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.5 13a3.5 3.5 0 0 1-.025-7A4.5 4.5 0 0 1 8.98 2.659a4.5 4.5 0 0 1 4.507 4.338A3.5 3.5 0 0 1 12.5 13h-8z"/>
            </svg>
          </span>
          <span className="tonight-score__factor-label">Weather</span>
          <span className="tonight-score__factor-value">
            {scores.weather !== null ? `${scores.weather}%` : '--'}
          </span>
        </div>
      </div>

      <div className="tonight-score__label">Tonight&apos;s Stargazing Score</div>
    </div>
  );
}

export default TonightScore;
