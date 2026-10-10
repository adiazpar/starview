/**
 * BirthDateForm Component
 *
 * Shows the owner's private date of birth. Editing opens the shared BirthDateDialog, the same dialog that
 * signup and the post-sign-in prompt use. The value is owner-only: it never belongs on a public profile.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import profileApi from '../../../../services/profile';
import { useToast } from '../../../../contexts/ToastContext';
import { formatBirthDate } from '../../../../utils/birthDate';
import BirthDateDialog from '../../BirthDateDialog';
import './styles.css';

function BirthDateForm({ user, refreshAuth }) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const birthDate = formatBirthDate(user?.birth_date, i18n.resolvedLanguage || i18n.language);

  // The page shows the refreshed account, so the dialog reports success only once that has arrived.
  const save = async (iso) => {
    await profileApi.updateBirthDate({ birth_date: iso });
    await refreshAuth();
    showToast(t('birthDate.saved'), 'success');
  };

  return (
    <div className="profile-form-section">
      {isEditing && (
        <BirthDateDialog
          key={user?.id}
          initialValue={user?.birth_date}
          onSubmit={save}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">{t('birthDate.title')}</h3>
          <p className="profile-form-description birth-date-private">
            <i className="fa-solid fa-lock" aria-hidden="true"></i>
            {t('birthDate.private')}
          </p>
        </div>
        <button
          type="button"
          className="profile-edit-btn"
          onClick={() => setIsEditing(true)}
          aria-label={t('birthDate.edit')}
          aria-haspopup="dialog"
        >
          <i className="fa-solid fa-pencil" aria-hidden="true"></i>
        </button>
      </div>

      <div className="profile-view-content">
        <span className={`profile-view-value ${!birthDate ? 'profile-view-value--empty' : ''}`}>
          {birthDate || t('birthDate.notSet')}
        </span>
      </div>
    </div>
  );
}

export default BirthDateForm;
