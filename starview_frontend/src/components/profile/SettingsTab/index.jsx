import ProfileSettings from '../ProfileSettings';
import PreferencesSection from '../PreferencesSection';
import ConnectedAccountsSection from '../ConnectedAccountsSection';
import './styles.css';

/**
 * SettingsTab - User's profile settings tab
 *
 * Contains three collapsible sections:
 * - ProfileSettings (profile picture, name, username, email, password, bio, location)
 * - PreferencesSection (theme selection)
 * - ConnectedAccountsSection (social account connections)
 */
function SettingsTab({ user, refreshAuth, socialAccounts, onRefreshSocialAccounts }) {
  return (
    <div className="profile-section">
      <h2 className="profile-section-title">Profile Settings</h2>
      <p className="profile-section-description">
        Manage your account settings and profile information
      </p>

      <div className="settings-tab">
        <ProfileSettings user={user} refreshAuth={refreshAuth} />
        <PreferencesSection />
        <ConnectedAccountsSection
          socialAccounts={socialAccounts}
          onRefresh={onRefreshSocialAccounts}
        />
      </div>
    </div>
  );
}

export default SettingsTab;
