import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../contexts/ToastContext';
import usePrivacyPreference from '../../../hooks/usePrivacyPreference';
import Switch from '../../shared/Switch';
import CollapsibleSection from '../CollapsibleSection';
import './styles.css';

/**
 * PrivacySection - Profile privacy preference
 *
 * Collapsible Settings section with the private-profile switch (checked means private; profiles are public by default).
 * For now this only saves the preference; nothing restricts who can view a profile yet.
 * The switch shows the account's saved value and moves only once a save has gone through and the account was refreshed.
 */
function PrivacySection({ user, refreshAuth }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isPrivate, isSaving, saveFailed, save } = usePrivacyPreference({ user, refreshAuth });
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const toggle = async (nextPrivate) => {
    if (await save(nextPrivate)) showToast(t('profilePrivacy.saved'), 'success');
  };

  const status = isSaving ? t('profilePrivacy.saving') : t(isPrivate ? 'profilePrivacy.on' : 'profilePrivacy.off');

  return (
    <CollapsibleSection title={t('profilePrivacy.title')} icon="fa-user-shield" defaultExpanded={false}>
      <div className="profile-form-section">
        <div className="profile-form-header privacy-setting">
          <div className="profile-form-header-content">
            <h3 className="profile-form-title" id={titleId}>{t('profilePrivacy.private')}</h3>
            <p className="profile-form-description" id={descriptionId}>{t('profilePrivacy.description')}</p>
          </div>

          <div className="privacy-control">
            {/* The switch announces its own state; this text is the visible echo of it. */}
            <span className="privacy-status" aria-hidden="true">{status}</span>
            <Switch
              checked={isPrivate}
              busy={isSaving}
              onChange={toggle}
              aria-labelledby={titleId}
              aria-describedby={[descriptionId, saveFailed && errorId].filter(Boolean).join(' ')}
            />
          </div>
        </div>

        {saveFailed && (
          <p className="privacy-error" id={errorId} role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {t('profilePrivacy.saveFailed')}
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default PrivacySection;
