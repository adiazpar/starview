import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import authApi from '../../services/auth';
import Dialog, { DialogFooter } from '../shared/Dialog';
import VerificationMethodPicker from './VerificationMethodPicker';
import './AccountConfirmation.css';

export function ConfirmationForm({ method, methods, preferredMethod, onComplete, onBusyChange,
  submitLabel = 'accountConfirmation.confirm', cancelLabel = 'accountConfirmation.cancel', description }) {
  const { t } = useTranslation();
  const fieldId = useId();
  const formId = useId();
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
  const password = selected === 'password';
  const backup = selected === 'recovery_codes';
  const delivery = options.find(option => option.id === selected)?.requires_delivery;
  const destination = options.find(option => option.id === selected)?.destination;
  const showInput = selected && (!delivery || sent);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const choose = (id) => { setSelected(id); setValue(''); setError(''); };
  const describeError = err => typeof err.response?.data?.detail === 'string'
    ? err.response.data.detail : t('accountConfirmation.failed');
  const sendCode = async () => {
    setBusy(true); setError('');
    try { await authApi.sendConfirmationCode(selected); setSent(true); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await authApi.confirmIdentity(password ? { password: value } : { method: selected, code: value.trim() });
      await onComplete(true);
    } catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  };

  return <>
    {primary.length > 1 && !backup && <VerificationMethodPicker methods={primary}
      selected={selected} onSelect={choose} disabled={busy} />}
    <p id={`${fieldId}-help`}>{t(description || (delivery && destination ? 'accountConfirmation.emailDestination'
      : selected ? `accountConfirmation.${selected}` : 'accountConfirmation.noMethod'), { email: destination })}</p>
    {delivery && sent && <p className="account-confirmation-notice" role="status">{t('accountConfirmation.sent')}</p>}
    <form id={formId} className="account-confirmation-form" onSubmit={submit}>
      {showInput && <>
        <label className="form-label" htmlFor={fieldId}>{t(password ? 'accountConfirmation.passwordLabel' : backup ? 'accountConfirmation.backupLabel' : 'accountConfirmation.codeLabel')}</label>
        <input id={fieldId} className="form-input" autoFocus required value={value} disabled={busy}
          type={password ? 'password' : 'text'} autoComplete={password ? 'current-password' : 'one-time-code'}
          inputMode={password ? 'text' : 'numeric'} maxLength={password ? 256 : backup ? 32 : 6}
          aria-describedby={`${fieldId}-help`} aria-invalid={!!error}
          onChange={event => setValue(event.target.value)} />
      </>}
      {delivery && sent && <button type="button" className="account-confirmation-link" disabled={busy} onClick={sendCode}>{t('accountConfirmation.resend')}</button>}
      {error && <p className="app-dialog-error" role="alert">{error}</p>}
    </form>
    {available.some(option => option.id === 'recovery_codes') && <div className="account-confirmation-backup">
      {(!backup || primary.length > 0) && <button type="button" className="account-confirmation-link" disabled={busy}
        onClick={() => choose(backup ? usualMethod : 'recovery_codes')}>
        {t(backup ? 'accountConfirmation.usePrimary' : 'accountConfirmation.useBackup')}
      </button>}
    </div>}
    <DialogFooter><div className="app-dialog-actions app-dialog-actions--spread">
      <button type="button" className="btn-secondary btn-secondary--sm" disabled={busy} onClick={() => onComplete(false)}>{t(cancelLabel)}</button>
      {delivery && !sent
        ? <button type="button" className="btn-primary btn-primary--sm" disabled={busy} onClick={sendCode}>{t(busy ? 'accountConfirmation.sending' : 'accountConfirmation.send')}</button>
        : <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={busy || !value.trim() || !selected}>
          {t(busy ? 'accountConfirmation.checking' : submitLabel)}
        </button>}
    </div></DialogFooter>
  </>;
}

export default function ConfirmationDialog(props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return <Dialog title={t('accountConfirmation.title')} dismissDisabled={busy} onCancel={() => props.onComplete(false)}>
    <ConfirmationForm {...props} onBusyChange={setBusy} />
  </Dialog>;
}
