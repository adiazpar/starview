import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import authApi from '../../services/auth';
import useCooldown, { retryAfterSeconds } from '../../hooks/useCooldown';
import Dialog, { DialogFooter } from '../shared/Dialog';
import VerificationCodeField from './VerificationCodeField';
import { VerificationLead, VerificationStatus } from './VerificationFeedback';
import VerificationMethodPicker from './VerificationMethodPicker';
import './AccountConfirmation.css';

/** Proof of identity for a method list. Leaving without proof is the owner's header arrow; this form only completes (true). */
export function ConfirmationForm({ method, methods, preferredMethod, onComplete, onBusyChange,
  submitLabel = 'accountConfirmation.confirm', description }) {
  const { t } = useTranslation();
  const fieldId = useId();
  const formId = useId();
  const inputRef = useRef(null);
  const options = methods || (method === 'mfa'
    ? [{ id: 'totp', available: true }, { id: 'recovery_codes', available: true }]
    : [{ id: method, available: true, requires_delivery: method === 'email_code' }]);
  const available = options.filter(option => option.available);
  const primary = available.filter(option => option.id !== 'recovery_codes');
  const usualMethod = primary.find(option => option.id === preferredMethod)?.id || primary[0]?.id;
  const [selected, setSelected] = useState(preferredMethod || primary[0]?.id || available[0]?.id);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, startCooldown] = useCooldown();
  const password = selected === 'password';
  const backup = selected === 'recovery_codes';
  const delivery = options.find(option => option.id === selected)?.requires_delivery;
  const destination = options.find(option => option.id === selected)?.destination;
  const showInput = selected && (!delivery || sent);
  const validValue = password || backup ? !!value.trim() : /^[0-9]{6}$/.test(value);
  const errorId = `${fieldId}-error`;
  const describedBy = `${fieldId}-help${error ? ` ${errorId}` : ''}`;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  // The field appears after a code is sent or the method changes, and again after a rejected value.
  useEffect(() => { if (showInput) inputRef.current?.focus(); }, [showInput, selected]);
  useEffect(() => { if (error) inputRef.current?.focus(); }, [error]);

  const choose = (id) => { setSelected(id); setValue(''); setError(''); };
  const describeError = err => typeof err.response?.data?.detail === 'string'
    ? err.response.data.detail : t('accountConfirmation.failed');
  const sendCode = async () => {
    setBusy(true); setError('');
    try { await authApi.sendConfirmationCode(selected); setSent(true); startCooldown(); }
    catch (err) { setError(describeError(err)); startCooldown(retryAfterSeconds(err)); }
    finally { setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy || !validValue || !selected) return;
    setBusy(true); setError('');
    try {
      await authApi.confirmIdentity(password ? { password: value } : { method: selected, code: value.trim() });
      await onComplete(true);
    } catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  };
  const waiting = cooldown > 0;
  const leadKey = delivery && sent ? `accountConfirmation.${destination ? 'codeSentTo' : 'codeSent'}`
    : description || (delivery && destination ? 'accountConfirmation.emailDestination'
      : selected ? `accountConfirmation.${selected}` : 'accountConfirmation.noMethod');

  return <>
    {primary.length > 1 && !backup && <VerificationMethodPicker methods={primary}
      selected={selected} onSelect={choose} disabled={busy} />}
    <VerificationLead id={`${fieldId}-help`} i18nKey={leadKey} email={destination} />
    <form id={formId} className="account-confirmation-form" onSubmit={submit}>
      {showInput && (password ? <>
        <label className="form-label" htmlFor={fieldId}>{t('accountConfirmation.passwordLabel')}</label>
        <input id={fieldId} ref={inputRef} className="form-input" required value={value} disabled={busy}
          type="password" autoComplete="current-password" enterKeyHint="done" maxLength={256}
          aria-describedby={describedBy} aria-invalid={!!error}
          onChange={event => setValue(event.target.value)} />
      </> : <VerificationCodeField id={fieldId} ref={inputRef} backup={backup} required value={value} disabled={busy}
        label={t(backup ? 'accountConfirmation.backupLabel' : 'accountConfirmation.codeLabel')}
        describedBy={describedBy} invalid={!!error} onChange={setValue} />)}
      {error && <VerificationStatus tone="error" id={errorId}>{error}</VerificationStatus>}
      {delivery && sent && <div className="verification-meta">
        <VerificationStatus>{t('accountConfirmation.sent')}</VerificationStatus>
        <button type="button" className="account-confirmation-link" disabled={busy || waiting} onClick={sendCode}>
          {t(waiting ? 'accountConfirmation.resendIn' : 'accountConfirmation.resend', { seconds: cooldown })}
        </button>
      </div>}
    </form>
    {available.some(option => option.id === 'recovery_codes') && <div className="account-confirmation-backup">
      {(!backup || primary.length > 0) && <button type="button" className="account-confirmation-link" disabled={busy}
        onClick={() => choose(backup ? usualMethod : 'recovery_codes')}>
        {t(backup ? 'accountConfirmation.usePrimary' : 'accountConfirmation.useBackup')}
      </button>}
    </div>}
    <DialogFooter><div className="app-dialog-actions app-dialog-actions--spread">
      {delivery && !sent
        ? <button type="button" className="btn-primary btn-primary--sm" disabled={busy || waiting} onClick={sendCode}>
          {busy ? t('accountConfirmation.sending') : t(waiting ? 'accountConfirmation.sendIn' : 'accountConfirmation.send', { seconds: cooldown })}
        </button>
        : <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={busy || !validValue || !selected}>
          {t(busy ? 'accountConfirmation.checking' : submitLabel)}
        </button>}
    </div></DialogFooter>
  </>;
}

export default function ConfirmationDialog(props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  // A successful check, the header arrow and Escape all share the same exit lifecycle; only a check accepts.
  const complete = accepted => dialog.current?.dismiss(() => props.onComplete(accepted));
  return <Dialog ref={dialog} title={t('accountConfirmation.title')} dismissDisabled={busy} onCancel={() => props.onComplete(false)}
    onBack={() => dialog.current?.dismiss()} backLabel={t('buttons.close')}>
    <ConfirmationForm {...props} onComplete={complete} onBusyChange={setBusy} />
  </Dialog>;
}
