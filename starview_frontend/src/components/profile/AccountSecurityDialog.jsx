import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '../shared/Dialog';
import LoadingSpinner from '../shared/LoadingSpinner';
import { ConfirmationForm } from './AccountConfirmation';
import VerificationCodeField from './VerificationCodeField';
import { VerificationLead, VerificationStatus } from './VerificationFeedback';
import VerificationMethodPicker from './VerificationMethodPicker';
import useCooldown, { retryAfterSeconds } from '../../hooks/useCooldown';
import useMediaQuery from '../../hooks/useMediaQuery';
import authApi from '../../services/auth';
import './AccountSecurityDialog.css';

// Calm confirmation shown in Manage after a change was saved.
const SAVED = {
  set_preferred_method: 'accountSecurity.savedDefault',
  set_email_destination: 'accountSecurity.savedEmail',
  activate_totp: 'accountSecurity.savedApp',
  remove_totp: 'accountSecurity.savedAppRemoved',
};
// Steps with nothing above them use the dialog's X close control.
const FIRST_LEVEL = ['loading', 'error', 'choose', 'manage'];

/** One modal: optional enrollment, read-only overview, and protected changes. */
export default function AccountSecurityDialog({ onClose, onChanged }) {
  const { t } = useTranslation();
  const formId = useId();
  const codeId = useId();
  const errorId = useId();
  // A touch keyboard would cover the QR code, so only desktop focuses the code field on arrival.
  const focusCodeField = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [step, setStep] = useState('loading');
  const [status, setStatus] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [selected, setSelected] = useState('totp');
  const [proof, setProof] = useState(null);
  const [codes, setCodes] = useState([]);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [emailChoice, setEmailChoice] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [cooldown, startCooldown] = useCooldown();
  const mounted = useRef(false);
  const running = useRef(false);
  const pending = useRef(null);
  const errorNotice = useRef(null);
  const codeField = useRef(null);
  const dialog = useRef(null);

  const load = useCallback(async () => {
    const { data } = await authApi.getSecurityMethods();
    if (mounted.current) {
      setStatus(data); setWizard(!data.enabled); setStep(data.enabled ? 'manage' : 'choose');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    load().catch(() => { if (mounted.current) { setError(t('accountSecurity.loadFailed')); setStep('error'); } });
    return () => { mounted.current = false; };
  }, [load, t]);
  // The notice sits beside the field it concerns; keep it in view if the body was scrolled.
  // The disabled code field lost focus during the request, so return it after a rejection.
  useEffect(() => {
    if (!error) return;
    errorNotice.current?.scrollIntoView?.({ block: 'nearest' });
    codeField.current?.focus();
  }, [error]);

  const clearSecrets = () => { setCodes([]); setQr(''); setCode(''); setEmailCodeSent(false); startCooldown(0); };
  // The shared dialog calls the owner only after its exit motion completes.
  const finish = () => dialog.current?.dismiss();
  const close = () => { if (!busy && !confirmBusy) finish(); };
  const go = next => { setSaved(''); setStep(next); };
  const run = async (operation, { onExpired = operation, returnStep = step } = {}) => {
    if (running.current || !mounted.current) return;
    running.current = true; setBusy(true); setError(''); setSaved('');
    try { await operation(); }
    catch (err) {
      if (!mounted.current) return;
      if (err.response?.status === 403) {
        try {
          const { data } = await authApi.getSecurityStatus();
          if (!mounted.current) return;
          if (!data.recent) {
            pending.current = { operation: onExpired, returnStep };
            clearSecrets(); setProof(data); setStep('confirm'); return;
          }
        } catch { /* Preserve the original operation error. */ }
      }
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : t('accountConfirmation.failed'));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const afterConfirmation = async accepted => {
    if (!mounted.current) return;
    const resume = pending.current;
    pending.current = null;
    setError(''); setStep(resume?.returnStep || 'manage');
    if (accepted && resume) await run(resume.operation, { returnStep: resume.returnStep });
  };
  const mutate = async (action, extra = {}) => {
    const { data } = await authApi.updateSecurityMethods({ action, ...extra });
    if (!mounted.current) return null;
    if (data.methods) setStatus(data);
    if (!['begin_totp', 'send_email_destination_code'].includes(action)) await onChanged?.();
    if (mounted.current && SAVED[action]) setSaved(SAVED[action]);
    return mounted.current ? data : null;
  };
  const showCodes = async () => {
    if (!mounted.current) return;
    setCodes([]); setStep('recovery');
    const { data } = await authApi.getRecoveryCodes();
    if (mounted.current) { setCodes(data.codes); setStep('recovery'); }
  };
  const beginApp = async () => {
    const data = await mutate('begin_totp');
    if (data && mounted.current) { setQr(data.qr_code); setCode(''); setStep('setup'); }
  };
  const sendDestinationCode = () => run(async () => {
    try {
      if (await mutate('send_email_destination_code', { email: emailChoice })) { setEmailCodeSent(true); startCooldown(); }
    } catch (err) { startCooldown(retryAfterSeconds(err)); throw err; }
  });
  const selectMethod = method => run(() => mutate('set_preferred_method', { method }));
  const back = () => {
    clearSecrets(); setError(''); go(wizard && !status?.enabled ? 'choose' : 'manage');
  };
  // Later steps use the header arrow. Setup and email enrollment return to the method choice; what is
  // reached from Manage returns to Manage; backup codes after enrollment return to Manage without undoing the
  // setup; a proof request cancels its pending action and returns to the step it came from.
  const atFirstLevel = FIRST_LEVEL.includes(step);
  const goBack = () => {
    if (step === 'confirm') afterConfirmation(false);
    else if (step === 'recovery') { clearSecrets(); setError(''); setWizard(false); go('manage'); }
    else back();
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'starview-backup-codes.txt'; link.click();
    URL.revokeObjectURL(url);
  };
  const appConnected = !!status?.methods.some(method => method.id === 'totp' && method.available);
  const emailMethod = status?.methods.find(method => method.id === 'email_code');
  const emailChoices = status?.email_choices || [];
  const alternateEmail = emailChoices.find(choice => choice.available && choice.email !== status?.email);
  const choices = [{ id: 'totp', available: !appConnected }, { id: 'email_code', available: !!emailMethod?.available }];
  const inWizard = wizard && ['choose', 'email', 'setup', 'recovery'].includes(step);
  const currentStep = step === 'choose' ? 1 : step === 'recovery' ? 3 : 2;
  const locked = busy || confirmBusy;
  const destructive = ['disable', 'remove', 'regenerate'].includes(step);
  const title = step === 'confirm' ? 'accountConfirmation.title'
    : destructive ? `accountSecurity.${step}Title`
    : inWizard ? 'accountSecurity.setupTitle'
    : step === 'recovery' ? 'accountSecurity.recoveryTitle'
    : step === 'setup' ? 'accountSecurity.connectApp'
    : step === 'email-change' ? 'accountSecurity.changeEmail'
    : 'accountSecurity.twoFactor';
  const isDefault = id => status?.preferred_method === id;
  const defaultChip = id => isDefault(id) && <span className="security-chip"><i className="fa-solid fa-check" aria-hidden="true" />{t('accountSecurity.defaultMethod')}</span>;
  // A rejection is shown beside the control it concerns (under the code field, above the list), not in a banner.
  const failure = error && <VerificationStatus ref={errorNotice} id={errorId} tone="error">{error}</VerificationStatus>;
  const codeFieldProps = { id: codeId, ref: codeField, pattern: '[0-9]{6}', required: true, value: code, onChange: setCode,
    disabled: locked, invalid: !!error, describedBy: error ? errorId : undefined };

  // Going back is the header arrow, so footers hold only the step's own actions.
  let footer;
  if (step === 'choose') footer = <button className="btn-primary btn-primary--sm" disabled={locked || !choices.find(method => method.id === selected)?.available}
    onClick={() => selected === 'email_code' ? setStep('email') : run(beginApp)}>{t('accountSecurity.next')}</button>;
  else if (step === 'email-change') footer = emailCodeSent
    ? <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={locked || !/^\d{6}$/.test(code)}>{t('buttons.save')}</button>
    : <button className="btn-primary btn-primary--sm" disabled={locked || cooldown > 0 || !emailChoice || emailChoice === status.email}
      onClick={sendDestinationCode}>{t(cooldown > 0 ? 'accountConfirmation.sendIn' : 'accountConfirmation.send', { seconds: cooldown })}</button>;
  else if (step === 'setup') footer = <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={locked || !/^\d{6}$/.test(code)}>
    {t(wizard ? 'accountSecurity.enable' : 'accountSecurity.connectApp')}
  </button>;
  else if (step === 'recovery') footer = <>
    {codes.length > 0
      ? <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={download}><i className="fa-solid fa-download" aria-hidden="true" />{t('accountSecurity.downloadCodes')}</button>
      : <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => run(showCodes, { returnStep: 'manage' })}>{t('accountSecurity.retry')}</button>}
    <button className="btn-primary btn-primary--sm" disabled={locked} onClick={close}>{t('buttons.done')}</button>
  </>;
  // Nothing here takes focus on arrival (no data-autofocus): the heading does, so the action is always deliberate.
  else if (destructive) footer = <button className={step === 'regenerate' ? 'btn-primary btn-primary--sm' : 'btn-danger btn-danger--sm'} disabled={locked}
    onClick={() => run(async () => {
      await mutate({ remove: 'remove_totp', disable: 'disable', regenerate: 'regenerate_recovery' }[step]);
      if (!mounted.current) return;
      if (step === 'disable') finish();
      else if (step === 'regenerate') await showCodes();
      else setStep('manage');
    })}>{t(`accountSecurity.${step}Action`)}</button>;
  else if (step === 'manage') footer = <button className="btn-primary btn-primary--sm" onClick={close} disabled={locked}>{t('buttons.done')}</button>;
  else if (step === 'error') footer = <button className="btn-primary btn-primary--sm" disabled={locked} onClick={() => run(load)}>{t('accountSecurity.retry')}</button>;

  return <Dialog ref={dialog} title={t(title)} onCancel={onClose} onBack={atFirstLevel ? undefined : goBack} backLabel={t('buttons.back')}
    dismissDisabled={locked} focusKey={`${step}:${status?.preferred_method || ''}`}
    footer={footer && <div className="app-dialog-actions app-dialog-actions--spread">{footer}</div>}>
    {inWizard && <ol className="security-setup-steps" aria-label={t('accountSecurity.setupProgress')}>
      {['chooseStep', 'verifyStep', 'backupStep'].map((label, index) => <li key={label}
        aria-current={currentStep === index + 1 ? 'step' : undefined} className={currentStep > index + 1 ? 'complete' : ''}>
        <span aria-hidden="true">{currentStep > index + 1 ? <i className="fa-solid fa-check" /> : index + 1}</span>{t(`accountSecurity.${label}`)}
      </li>)}
    </ol>}
    {step === 'loading' && <p className="security-loading" role="status"><LoadingSpinner size="xs" inline />{t('buttons.loading')}</p>}
    {step === 'error' && failure}
    {step === 'choose' && <>
      <VerificationLead i18nKey="accountSecurity.chooseIntro" />
      <VerificationMethodPicker methods={choices} selected={selected} onSelect={setSelected} disabled={locked} setup />
      <p className="security-setup-note">{t('accountSecurity.backupLater')}</p>
      {failure}
    </>}
    {step === 'confirm' && <ConfirmationForm method={proof.method} methods={proof.methods} preferredMethod={proof.preferred_method}
      onComplete={afterConfirmation} onBusyChange={setConfirmBusy} />}
    {step === 'email' && <>
      <ConfirmationForm methods={[{ ...emailMethod, destination: emailMethod.destination || status.email }]} preferredMethod="email_code"
        onBusyChange={setConfirmBusy} submitLabel="accountSecurity.enable" description="accountSecurity.emailSetup"
        onComplete={async () => {
          if (!mounted.current) return;
          await run(async () => { if (await mutate('enable')) await showCodes(); });
        }} />
      {failure}
    </>}
    {step === 'email-change' && <>
      <VerificationLead i18nKey={emailCodeSent ? 'accountConfirmation.codeSentTo' : 'accountSecurity.emailDestinationHelp'} email={emailChoice} />
      <form id={formId} className="security-code-form" onSubmit={event => {
        event.preventDefault();
        run(async () => {
          if (await mutate('set_email_destination', { email: emailChoice, code: code.trim() })) { clearSecrets(); setStep('manage'); }
        }, { onExpired: async () => { clearSecrets(); setStep('email-change'); }, returnStep: 'email-change' });
      }}>
        <label className="form-label" htmlFor={`${codeId}-email`}>{t('accountSecurity.emailDestination')}</label>
        <select className="form-input" id={`${codeId}-email`} value={emailChoice} disabled={locked}
          onChange={event => { setEmailChoice(event.target.value); setEmailCodeSent(false); setCode(''); setError(''); startCooldown(0); }}>
          {emailChoices.map(choice => <option key={choice.email} value={choice.email} disabled={!choice.available}>
            {choice.email} ({t(`accountSecurity.emailSources.${choice.source}`)})
          </option>)}
        </select>
        {!emailCodeSent && <p className="security-field-note">{emailChoice}</p>}
        {emailCodeSent && <div className="security-email-code">
          <VerificationCodeField {...codeFieldProps} label={t('accountConfirmation.codeLabel')} autoFocus />
        </div>}
        {failure}
        {emailCodeSent && <div className="verification-meta">
          <VerificationStatus>{t('accountConfirmation.sent')}</VerificationStatus>
          <button type="button" className="account-confirmation-link" disabled={locked || cooldown > 0} onClick={sendDestinationCode}>
            {t(cooldown > 0 ? 'accountConfirmation.resendIn' : 'accountConfirmation.resend', { seconds: cooldown })}
          </button>
        </div>}
      </form>
    </>}
    {step === 'setup' && <>
      <VerificationLead i18nKey="accountSecurity.scan" />
      <img className="security-setup-qr" src={qr} alt={t('accountSecurity.qrLabel')} />
      <form id={formId} className="security-code-form" onSubmit={event => {
        event.preventDefault();
        let activated = false;
        run(async () => {
          if (!await mutate('activate_totp', { code: code.trim() })) return;
          activated = true; setQr(''); setCode('');
          if (wizard) await showCodes();
          else setStep('manage');
        }, { onExpired: () => activated ? showCodes() : beginApp(), returnStep: wizard ? 'choose' : 'manage' });
      }}>
        <VerificationCodeField {...codeFieldProps} label={t('accountSecurity.appCode')} autoFocus={focusCodeField} />
        {failure}
      </form>
    </>}
    {step === 'manage' && <>
      <VerificationStatus className="security-flush-status security-state">{t('accountSecurity.on')}</VerificationStatus>
      <VerificationLead i18nKey="accountSecurity.manageIntro" />
      {saved && <VerificationStatus className="security-flush-status">{t(saved)}</VerificationStatus>}
      {failure}
      <ul className="security-methods" aria-label={t('accountSecurity.methodsLabel')}>
        <li className="security-method">
          <h3>{t('accountConfirmation.methods.email_code')}{defaultChip('email_code')}</h3>
          <p className="security-method-email">{emailMethod?.available ? status.email || t('accountSecurity.emailAvailable') : t('accountSecurity.emailUnavailable')}</p>
          {(!isDefault('email_code') || alternateEmail) && <div className="security-method-actions">
            {!isDefault('email_code') && <button className="btn-secondary btn-secondary--sm" disabled={locked || !emailMethod?.available}
              onClick={() => selectMethod('email_code')}>{t(emailMethod?.available ? 'accountSecurity.useEmail' : 'accountSecurity.unavailable')}</button>}
            {alternateEmail && <button className="account-confirmation-link" disabled={locked} onClick={() => {
              clearSecrets(); setError(''); setEmailChoice(alternateEmail.email); go('email-change');
            }}>{t('accountSecurity.changeEmail')}</button>}
          </div>}
        </li>
        <li className="security-method">
          <h3>{t('accountConfirmation.methods.totp')}{defaultChip('totp')}</h3>
          <p>{t(appConnected ? 'accountSecurity.appConnected' : 'accountSecurity.appNotConnected')}</p>
          <div className="security-method-actions">
            {appConnected ? <>
              {!isDefault('totp') && <button className="btn-secondary btn-secondary--sm" disabled={locked}
                onClick={() => selectMethod('totp')}>{t('accountSecurity.useApp')}</button>}
              <button className="account-confirmation-link" disabled={locked} onClick={() => go('remove')}>{t('accountSecurity.removeApp')}</button>
            </> : <button className="btn-secondary btn-secondary--sm" disabled={locked}
              onClick={() => run(beginApp)}>{t('accountSecurity.connectApp')}</button>}
          </div>
        </li>
      </ul>
      <section className="security-backup-section">
        <h3 className="security-step-title">{t('accountSecurity.recoveryTitle')}</h3>
        <p>{t('accountSecurity.recoveryAvailable', { count: status.recovery_count })} · {t('accountSecurity.backupOnly')}</p>
        <div className="security-method-actions">
          {status.recovery_count > 0 && <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => run(showCodes)}>{t('accountSecurity.viewCodes')}</button>}
          <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => go('regenerate')}>{t('accountSecurity.generateCodes')}</button>
        </div>
      </section>
      <div className="security-danger-zone">
        <button type="button" className="security-danger-link" disabled={locked} onClick={() => go('disable')}>{t('accountSecurity.turnOff')}</button>
      </div>
    </>}
    {step === 'recovery' && <>
      {wizard && <VerificationStatus className="security-flush-status security-state">{t('accountSecurity.enabledSuccess')}</VerificationStatus>}
      <VerificationLead i18nKey="accountSecurity.saveCodes" />
      {busy && !codes.length && <p className="security-loading" role="status"><LoadingSpinner size="xs" inline />{t('buttons.loading')}</p>}
      {codes.length > 0 && <ul className="security-backup-codes" aria-label={t('accountSecurity.recoveryTitle')}>
        {codes.map(value => <li key={value}><code>{value}</code></li>)}
      </ul>}
      {failure}
    </>}
    {destructive && <>
      <VerificationLead i18nKey={`accountSecurity.${step}Confirm`} />
      {failure}
    </>}
  </Dialog>;
}
