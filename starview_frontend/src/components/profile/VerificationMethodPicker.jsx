import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import './VerificationMethodPicker.css';

/**
 * Native radio group shared by setup and confirmation: cards while setting up,
 * compact segments while confirming. Backup codes live separately. The label and the
 * selected state identify a method; there is no per-method icon.
 */
export default function VerificationMethodPicker({ methods, selected, onSelect, disabled, setup = false }) {
  const { t } = useTranslation();
  const name = useId();
  return <fieldset className={`verification-method-picker${setup ? ' verification-method-picker--cards' : ''}`} disabled={disabled}>
    <legend>{t('accountConfirmation.chooseMethod')}</legend>
    {methods.filter(method => method.id !== 'recovery_codes').map(method =>
      <label key={method.id} className="verification-method-choice">
        <input type="radio" name={name} value={method.id} checked={selected === method.id}
          disabled={!method.available} onChange={() => onSelect(method.id)} />
        <span className="verification-method-copy">
          <span className="verification-method-title">{t(`accountConfirmation.methods.${method.id}`, { defaultValue: method.label })}
            {setup && method.id === 'totp' && <span className="verification-method-recommended">{t('accountSecurity.recommended')}</span>}
          </span>
          {setup && <span className="verification-method-description">{t(`accountSecurity.choose.${method.id}`)}</span>}
          {!method.available && <span className="verification-method-description">{t(`accountConfirmation.unavailable.${method.id}`)}</span>}
        </span>
        <span className="verification-method-radio" aria-hidden="true"><i className="fa-solid fa-check" /></span>
      </label>)}
  </fieldset>;
}
