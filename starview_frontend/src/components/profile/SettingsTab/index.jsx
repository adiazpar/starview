import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProfileSettings from '../ProfileSettings';
import PreferencesSection from '../PreferencesSection';
import PrivacySection from '../PrivacySection';
import ConnectedAccountsSection from '../ConnectedAccountsSection';
import CollapsibleSection from '../CollapsibleSection';
import { useTranslation } from 'react-i18next';
import AccountSecurityDialog from '../AccountSecurityDialog';
import './styles.css';

/**
 * SettingsTab - User's profile settings tab
 *
 * Contains reusable account settings sections:
 * - ProfileSettings (profile picture, name, username, email, password, bio, location)
 * - PreferencesSection (theme selection)
 * - PrivacySection (public/private profile preference)
 * - Account security (two-factor authentication and recovery)
 * - ConnectedAccountsSection (social account connections)
 */
function SettingsTab({ user, refreshAuth, socialAccounts, onRefreshSocialAccounts }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [securityOpen, setSecurityOpen] = useState(false);
  const securityTitleId = useId();
  const closeSecurity = () => {
    setSecurityOpen(false);
    if (params.has('security')) {
      const next = new URLSearchParams(params);
      next.delete('security');
      setParams(next, { replace: true });
    }
  };

  return (
    <div className="profile-section">
      {(securityOpen || params.get('security') === '1') && <AccountSecurityDialog
        key={user.id} onClose={closeSecurity} onChanged={refreshAuth} />}
      <h2 className="profile-section-title">Profile Settings</h2>
      <p className="profile-section-description">
        Manage your account settings and profile information
      </p>

      <div className="settings-tab">
        <ProfileSettings user={user} refreshAuth={refreshAuth} />
        <PreferencesSection />
        <PrivacySection user={user} refreshAuth={refreshAuth} />
        <CollapsibleSection title={t('accountSecurity.title')} icon="fa-lock" defaultExpanded={false}>
          <div className="profile-form-section">
            <h3 className="profile-form-title" id={securityTitleId}>{t('accountSecurity.twoFactor')}</h3>
            <p className="profile-form-description">{t(user.mfa_enabled ? 'accountSecurity.enabled' : 'accountSecurity.description')}</p>
            <div className="profile-form-controls">
              <button type="button" className="btn-secondary btn-secondary--sm" aria-describedby={securityTitleId} onClick={() => setSecurityOpen(true)}>
                {t(user.mfa_enabled ? 'accountSecurity.manage' : 'accountSecurity.setUp')}
              </button>
            </div>
          </div>
        </CollapsibleSection>
        <ConnectedAccountsSection
          socialAccounts={socialAccounts}
          onRefresh={onRefreshSocialAccounts}
        />
      </div>
    </div>
  );
}

export default SettingsTab;
