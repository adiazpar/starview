import { useState } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import Alert from '../../shared/alert';
import CollapsibleSection from '../CollapsibleSection';
import './styles.css';

/**
 * PreferencesSection - User preferences component
 *
 * Allows users to change theme (Light/Dark/Auto)
 */
function PreferencesSection() {
  const { theme, setThemeMode } = useTheme();
  const [success, setSuccess] = useState('');

  const handleThemeChange = (newTheme) => {
    setThemeMode(newTheme);
    setSuccess(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode`);
  };

  return (
    <CollapsibleSection title="Preferences" defaultExpanded={false}>
      <div className="preferences-grid">
        {/* Theme Section */}
        <div className="profile-form-section">
          <h3 className="profile-form-title">Theme</h3>
          <p className="profile-form-description">Choose how Starview looks to you. Select a theme or sync with your system preferences.</p>

          {/* Success Message */}
          {success && (
            <Alert
              type="success"
              message={success}
              onClose={() => setSuccess('')}
            />
          )}

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
      </div>
    </CollapsibleSection>
  );
}

export default PreferencesSection;
