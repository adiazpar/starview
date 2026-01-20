/* SkyQualityPanel Component
 * Observatory instrument readout displaying Bortle class, SQM, and elevation.
 * Features technical font styling and accent glow effects.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useUnits } from '../../../hooks/useUnits';
import './styles.css';

// Bortle class descriptions and colors
const BORTLE_DATA = {
  1: { label: 'Excellent Dark Sky', color: '#0a0a0a', textColor: '#00ff88' },
  2: { label: 'Typical Dark Site', color: '#1a1a2e', textColor: '#00e4b8' },
  3: { label: 'Rural Sky', color: '#2a2a4e', textColor: '#00d4aa' },
  4: { label: 'Rural/Suburban', color: '#3a3a5e', textColor: '#4dd4ac' },
  5: { label: 'Suburban Sky', color: '#4a4a6e', textColor: '#66c4aa' },
  6: { label: 'Bright Suburban', color: '#5a5a7e', textColor: '#88b4aa' },
  7: { label: 'Suburban/Urban', color: '#6a6a8e', textColor: '#aaa4aa' },
  8: { label: 'City Sky', color: '#7a7a9e', textColor: '#cc9488' },
  9: { label: 'Inner City Sky', color: '#8a8aae', textColor: '#ff8866' },
};

function SkyQualityPanel({ bortle, sqm, elevation }) {
  const { formatElevation } = useUnits();

  const bortleInfo = useMemo(() => {
    if (!bortle || bortle < 1 || bortle > 9) return null;
    return BORTLE_DATA[bortle];
  }, [bortle]);

  // Calculate scale fill percentage (inverted - lower is better)
  const scaleFill = bortle ? ((10 - bortle) / 9) * 100 : 0;

  return (
    <div className="sky-quality-panel glass-card">
      <div className="sky-quality-panel__header">
        <span className="sky-quality-panel__title">Sky Quality</span>
      </div>

      {/* Data Readouts */}
      <div className="sky-quality-panel__readouts">
        {/* Bortle Class - Primary */}
        <Link to="/bortle" className="sky-quality-panel__readout sky-quality-panel__readout--primary">
          <div
            className="sky-quality-panel__value"
            style={{ color: bortleInfo?.textColor || 'var(--accent)' }}
          >
            {bortle ? `B${bortle}` : '—'}
          </div>
          <div className="sky-quality-panel__label">Bortle</div>
        </Link>

        {/* SQM Reading */}
        <div className="sky-quality-panel__readout">
          <div className="sky-quality-panel__value">
            {sqm ? parseFloat(sqm).toFixed(2) : '—'}
          </div>
          <div className="sky-quality-panel__label">mag/arcsec²</div>
        </div>

        {/* Elevation */}
        <div className="sky-quality-panel__readout">
          <div className="sky-quality-panel__value">
            {elevation != null ? formatElevation(elevation) : '—'}
          </div>
          <div className="sky-quality-panel__label">Elevation</div>
        </div>
      </div>

      {/* Bortle Scale Visualization */}
      {bortle && bortleInfo && (
        <div className="sky-quality-panel__scale">
          <div className="sky-quality-panel__scale-bar">
            <div
              className="sky-quality-panel__scale-fill"
              style={{
                width: `${scaleFill}%`,
                background: `linear-gradient(90deg, ${bortleInfo.textColor}, var(--accent))`,
              }}
            />
            {/* Scale markers */}
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <div
                key={n}
                className={`sky-quality-panel__scale-marker ${n === bortle ? 'sky-quality-panel__scale-marker--active' : ''}`}
                style={{ left: `${((10 - n) / 9) * 100}%` }}
              />
            ))}
          </div>
          <div className="sky-quality-panel__scale-label">
            {bortleInfo.label}
          </div>
        </div>
      )}

      {/* Learn More Link */}
      <Link to="/bortle" className="sky-quality-panel__link">
        <span>Learn about the Bortle Scale</span>
        <i className="fa-solid fa-arrow-right"></i>
      </Link>
    </div>
  );
}

export default SkyQualityPanel;
