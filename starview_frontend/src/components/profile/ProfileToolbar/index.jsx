import { useTranslation } from 'react-i18next';
import '../../../styles/page-controls.css';
import './styles.css';

/**
 * ProfileToolbar Component
 *
 * Compact controls above a ProfileHeader card: Back on the left and the options
 * ellipsis on the right. Used by other users' public profiles and the account
 * settings page; profile actions (Follow, Show Badges) stay inside the card.
 *
 * Props:
 * - onBack: Called when Back is activated. Navigation lives in useProfileNavigation.
 *
 * The ellipsis is a placeholder with no menu yet, so it does nothing when activated.
 */
function ProfileToolbar({ onBack, onShare }) {
  const { t } = useTranslation();

  return (
    <div className="profile-toolbar animate-fade-in-up">
      <button
        type="button"
        className="page-action page-action--labelled"
        onClick={onBack}
        aria-label={t('buttons.back')}
      >
        <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
        <span className="page-action__label">{t('buttons.back')}</span>
      </button>
      <div className="profile-toolbar__actions">
        {onShare && (
          <button
            type="button"
            className="page-action"
            onClick={onShare}
            aria-label={t('buttons.share')}
          >
            <i className="fa-solid fa-share" aria-hidden="true"></i>
          </button>
        )}
        <button
          type="button"
          className="page-action"
          aria-label={t('buttons.moreOptions')}
        >
          <i className="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

export default ProfileToolbar;
