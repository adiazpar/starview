import { useTheme } from '../../../hooks/useTheme';
import { useUnits } from '../../../hooks/useUnits';
import CollapsibleSection from '../CollapsibleSection';
import './styles.css';

/**
 * PreferencesSection - User preferences component
 *
 * Allows users to change theme (Light/Dark/Auto) and unit system (Metric/Imperial)
 */
function PreferencesSection() {
  const { theme, setThemeMode } = useTheme();
  const { units, setUnits, isUpdating } = useUnits();

  const handleThemeChange = (newTheme) => {
    setThemeMode(newTheme);
  };

  const handleUnitsChange = (newUnits) => {
    setUnits(newUnits);
  };

  return (
    <CollapsibleSection title="Preferences" defaultExpanded={false}>
      <div className="preferences-grid">
        {/* Theme Section */}
        <div className="profile-form-section">
          <h3 className="profile-form-title">Theme</h3>
          <p className="profile-form-description">Choose how Starview looks to you. Select a theme or sync with your system preferences.</p>

          <div className="theme-selector">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => handleThemeChange('light')}
              type="button"
            >
              <i className="fa-solid fa-sun"></i>
              <span>Light</span>
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => handleThemeChange('dark')}
              type="button"
            >
              <i className="fa-solid fa-moon"></i>
              <span>Dark</span>
            </button>
            <button
              className={`theme-option ${theme === 'auto' ? 'active' : ''}`}
              onClick={() => handleThemeChange('auto')}
              type="button"
            >
              <i className="fa-solid fa-circle-half-stroke"></i>
              <span>Auto</span>
            </button>
          </div>
        </div>

        {/* Units Section */}
        <div className="profile-form-section">
          <h3 className="profile-form-title">Units</h3>
          <p className="profile-form-description">Choose how distances and elevations are displayed.</p>

          <div className="units-selector">
            <button
              className={`units-option ${units === 'metric' ? 'active' : ''}`}
              onClick={() => handleUnitsChange('metric')}
              type="button"
              disabled={isUpdating}
            >
              <i className="fa-solid fa-ruler"></i>
              <span>Metric</span>
              <span className="units-example">km, m</span>
            </button>
            <button
              className={`units-option ${units === 'imperial' ? 'active' : ''}`}
              onClick={() => handleUnitsChange('imperial')}
              type="button"
              disabled={isUpdating}
            >
              <i className="fa-solid fa-ruler-horizontal"></i>
              <span>Imperial</span>
              <span className="units-example">mi, ft</span>
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default PreferencesSection;
