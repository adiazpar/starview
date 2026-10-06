import { useTranslation } from 'react-i18next';
import './VerificationMethodPicker.css';

/** Shared choice cards for setup and confirmation. Backup codes live separately. */
export default function VerificationMethodPicker({ methods, selected, onSelect, disabled, setup = false }) {
  const { t } = useTranslation();
  return <div className="verification-method-picker" role="group" aria-label={t('accountConfirmation.chooseMethod')}>
    {methods.filter(method => method.id !== 'recovery_codes').map(method =>
      <button key={method.id} type="button" className="verification-method-choice"
        aria-pressed={selected === method.id} disabled={disabled || !method.available}
        onClick={() => onSelect(method.id)}>
        <i className={`fa-solid ${method.id === 'totp' ? 'fa-mobile-screen-button' : method.id === 'password' ? 'fa-lock' : 'fa-envelope'}`} aria-hidden="true" />
        <span className="verification-method-copy">
          <span className="verification-method-title">{t(`accountConfirmation.methods.${method.id}`, { defaultValue: method.label })}
            {setup && method.id === 'totp' && <span className="verification-method-recommended">{t('accountSecurity.recommended')}</span>}
          </span>
          {setup && <span className="verification-method-description">{t(`accountSecurity.choose.${method.id}`)}</span>}
          {!method.available && <span className="verification-method-description">{t(`accountConfirmation.unavailable.${method.id}`)}</span>}
        </span>
        <span className="verification-method-radio" aria-hidden="true">{selected === method.id && <i className="fa-solid fa-check" />}</span>
      </button>)}
  </div>;
}
