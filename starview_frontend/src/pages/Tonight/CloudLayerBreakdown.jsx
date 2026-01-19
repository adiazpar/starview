/**
 * Cloud Layer Breakdown
 * Shows low/mid/high cloud layer percentages with progress bars
 * and a smart stargazing insight message.
 */

import { CLOUD_LAYER_LABELS, getCloudLayerInsight } from './utils';
import './CloudLayerBreakdown.css';

/**
 * Displays cloud layer breakdown with progress bars and insight
 * @param {Object} props
 * @param {number|null} props.low - Low cloud cover percentage (0-100)
 * @param {number|null} props.mid - Mid cloud cover percentage (0-100)
 * @param {number|null} props.high - High cloud cover percentage (0-100)
 */
export default function CloudLayerBreakdown({ low, mid, high }) {
  const insight = getCloudLayerInsight(low, mid, high);

  // Don't render if all values are null/undefined
  if (low == null && mid == null && high == null) {
    return null;
  }

  const layers = [
    { key: 'high', value: high, ...CLOUD_LAYER_LABELS.high },
    { key: 'mid', value: mid, ...CLOUD_LAYER_LABELS.mid },
    { key: 'low', value: low, ...CLOUD_LAYER_LABELS.low },
  ];

  return (
    <div className="cloud-layer-breakdown">
      <div className="cloud-layer-breakdown__header">
        <span className="cloud-layer-breakdown__title">Cloud Layers</span>
      </div>

      <div className="cloud-layer-breakdown__layers">
        {layers.map(({ key, name, altitude, value }) => (
          <div key={key} className="cloud-layer-breakdown__row">
            <span className="cloud-layer-breakdown__label">
              {name}
              <span className="cloud-layer-breakdown__altitude">{altitude}</span>
            </span>
            <div className="cloud-layer-breakdown__bar-container">
              <div
                className={`cloud-layer-breakdown__bar cloud-layer-breakdown__bar--${key}`}
                style={{ width: value != null ? `${value}%` : '0%' }}
              />
            </div>
            <span className="cloud-layer-breakdown__value">
              {value != null ? `${value}%` : '--'}
            </span>
          </div>
        ))}
      </div>

      {insight && (
        <div className={`cloud-layer-breakdown__insight cloud-layer-breakdown__insight--${insight.quality}`}>
          <span className="cloud-layer-breakdown__insight-icon">
            {insight.quality === 'good' && '★'}
            {insight.quality === 'fair' && '◐'}
            {insight.quality === 'poor' && '○'}
          </span>
          <span className="cloud-layer-breakdown__insight-text">{insight.message}</span>
        </div>
      )}
    </div>
  );
}
