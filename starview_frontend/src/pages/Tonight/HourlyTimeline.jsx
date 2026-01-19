/**
 * Hourly Weather Timeline
 * Interactive bar chart showing nighttime cloud cover conditions.
 * Tap hours to see detailed weather for that time.
 */

import React, { useRef, useEffect } from 'react';
import WeatherGraphic from '../../components/shared/WeatherGraphic';
import CloudLayerBreakdown from './CloudLayerBreakdown';
import './HourlyTimeline.css';

/**
 * Format time string to display format (e.g., "6pm", "12am")
 */
const formatHour = (timeString) => {
  const date = new Date(timeString);
  const hour = date.getHours();
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour > 12 ? `${hour - 12}pm` : `${hour}am`;
};

/**
 * Interactive hourly weather timeline for nighttime conditions
 * Shows cloud cover bars for each hour, tap to select
 */
export default function HourlyTimeline({
  hours,
  selectedHour,
  onHourSelect,
  currentHour,
}) {
  // Store last selected data for smooth collapse animation
  const lastDataRef = useRef(null);

  // Update ref when we have valid selected data
  useEffect(() => {
    if (selectedHour !== null && hours[selectedHour]) {
      lastDataRef.current = hours[selectedHour];
    }
  }, [selectedHour, hours]);

  if (!hours?.length) return null;

  // Use current selection or last selection for display during collapse
  const displayData = selectedHour !== null && hours[selectedHour]
    ? hours[selectedHour]
    : lastDataRef.current;
  const isExpanded = selectedHour !== null && hours[selectedHour];

  return (
    <section className="hourly-timeline-section">
    <div className="hourly-timeline">
      <div className="hourly-timeline__header">
        <span className="hourly-timeline__title">Tonight&apos;s Conditions</span>
        <span className="hourly-timeline__subtitle">Tap hour for details</span>
      </div>

      <div className="hourly-timeline__chart">
        {hours.map((hour, index) => {
          const hourTime = new Date(hour.time);
          const hourNum = hourTime.getHours();
          const isSelected = selectedHour === index;
          const isCurrent = currentHour === hourNum;
          const cloudCover = hour.cloud_cover ?? 0;

          return (
            <button
              key={hour.time}
              className={`hourly-timeline__bar ${isSelected ? 'hourly-timeline__bar--selected' : ''} ${isCurrent ? 'hourly-timeline__bar--current' : ''}`}
              onClick={() => onHourSelect(isSelected ? null : index)}
              aria-label={`${formatHour(hour.time)}: ${cloudCover}% cloud cover`}
            >
              <div
                className="hourly-timeline__fill"
                style={{ height: `${Math.max(cloudCover, 5)}%` }}
                data-cloud={cloudCover}
              />
              <span className="hourly-timeline__label">{formatHour(hour.time)}</span>
              <div className="hourly-timeline__weather-icon">
                <WeatherGraphic
                  cloudCover={cloudCover}
                  precipitationType={hour.precipitation_type}
                  precipitationProbability={hour.precipitation_probability}
                  size={20}
                  isNight
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className={`hourly-timeline__details-wrapper ${isExpanded ? 'hourly-timeline__details-wrapper--expanded' : ''}`}>
        <div className="hourly-timeline__details-inner">
          {displayData && (
            <div className="hourly-timeline__details">
              <div className="hourly-timeline__detail-row">
                <span className="hourly-timeline__detail-label">Cloud Cover</span>
                <span className="hourly-timeline__detail-value">
                  {displayData.cloud_cover}%
                </span>
              </div>
              {displayData.visibility !== undefined && displayData.visibility !== null && (
                <div className="hourly-timeline__detail-row">
                  <span className="hourly-timeline__detail-label">Visibility</span>
                  <span className="hourly-timeline__detail-value">{displayData.visibility} km</span>
                </div>
              )}
              {displayData.humidity !== undefined && displayData.humidity !== null && (
                <div className="hourly-timeline__detail-row">
                  <span className="hourly-timeline__detail-label">Humidity</span>
                  <span className="hourly-timeline__detail-value">{displayData.humidity}%</span>
                </div>
              )}
              {displayData.temperature !== undefined && displayData.temperature !== null && (
                <div className="hourly-timeline__detail-row">
                  <span className="hourly-timeline__detail-label">Temperature</span>
                  <span className="hourly-timeline__detail-value">{Math.round(displayData.temperature)}°C</span>
                </div>
              )}
              <CloudLayerBreakdown
                low={displayData.cloud_cover_low}
                mid={displayData.cloud_cover_mid}
                high={displayData.cloud_cover_high}
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </section>
  );
}
