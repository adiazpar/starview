import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '../shared/Dialog';
import { ConfirmationForm } from './AccountConfirmation';
import VerificationMethodPicker from './VerificationMethodPicker';
import authApi from '../../services/auth';
import './AccountSecurityDialog.css';

/** One modal: optional enrollment, read-only overview, and protected changes. */
export default function AccountSecurityDialog({ onClose, onChanged }) {
  const { t } = useTranslation();
  const formId = useId();
  const codeId = useId();
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
  const mounted = useRef(false);
  const running = useRef(false);
  const pending = useRef(null);

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

  const clearSecrets = () => { setCodes([]); setQr(''); setCode(''); setEmailCodeSent(false); };
  const close = () => { if (!busy && !confirmBusy) onClose(); };
  const run = async (operation, { onExpired = operation, returnStep = step } = {}) => {
    if (running.current || !mounted.current) return;
    running.current = true; setBusy(true); setError('');
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
  const selectMethod = method => run(() => mutate('set_preferred_method', { method }));
  const back = () => {
    clearSecrets(); setError(''); setStep(wizard && !status?.enabled ? 'choose' : 'manage');
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
  const choices = [{ id: 'totp', available: !appConnected }, { id: 'email_code', available: !!emailMethod?.available }];
  const inWizard = wizard && ['choose', 'email', 'setup', 'recovery'].includes(step);
  const currentStep = step === 'choose' ? 1 : step === 'recovery' ? 3 : 2;
  const locked = busy || confirmBusy;
  const destructive = ['disable', 'remove', 'regenerate'].includes(step);
  const title = step === 'confirm' ? 'accountConfirmation.title'
    : inWizard ? 'accountSecurity.setupTitle'
    : step === 'recovery' ? 'accountSecurity.recoveryTitle'
    : step === 'setup' ? 'accountSecurity.connectApp'
    : step === 'email-change' ? 'accountSecurity.changeEmail'
    : 'accountSecurity.twoFactor';

  let footer;
  if (step === 'choose') footer = <>
    <button className="btn-secondary btn-secondary--sm" onClick={close} disabled={locked}>{t('buttons.cancel')}</button>
    <button className="btn-primary btn-primary--sm" disabled={locked || !choices.find(method => method.id === selected)?.available}
      onClick={() => selected === 'email_code' ? setStep('email') : run(beginApp)}>{t('accountSecurity.next')}</button>
  </>;
  else if (step === 'email-change') footer = <>
    <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={back}>{t('buttons.cancel')}</button>
    {emailCodeSent
      ? <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={locked || !/^\d{6}$/.test(code)}>{t('buttons.save')}</button>
      : <button className="btn-primary btn-primary--sm" disabled={locked || !emailChoice || emailChoice === status.email}
        onClick={() => run(async () => {
          if (await mutate('send_email_destination_code', { email: emailChoice })) { setEmailCodeSent(true); setStep('email-change'); }
        })}>{t('accountConfirmation.send')}</button>}
  </>;
  else if (step === 'setup') footer = <>
    <button className="btn-secondary btn-secondary--sm" onClick={back} disabled={locked}>{t('buttons.back')}</button>
    <button type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={locked || !/^\d{6}$/.test(code)}>
      {t(wizard ? 'accountSecurity.enable' : 'accountSecurity.connectApp')}
    </button>
  </>;
  else if (step === 'recovery') footer = <>
    {codes.length > 0
      ? <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={download}>{t('accountSecurity.downloadCodes')}</button>
      : <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => run(showCodes, { returnStep: 'manage' })}>{t('accountSecurity.retry')}</button>}
    <button className="btn-primary btn-primary--sm" disabled={locked} onClick={close}>{t('buttons.done')}</button>
  </>;
  else if (destructive) footer = <>
    <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={back}>{t('buttons.cancel')}</button>
    <button className={step === 'regenerate' ? 'btn-primary btn-primary--sm' : 'btn-danger btn-danger--sm'} disabled={locked}
      onClick={() => run(async () => {
        await mutate({ remove: 'remove_totp', disable: 'disable', regenerate: 'regenerate_recovery' }[step]);
        if (!mounted.current) return;
        if (step === 'disable') onClose();
        else if (step === 'regenerate') await showCodes();
        else setStep('manage');
      })}>{t(`accountSecurity.${step}Action`)}</button>
  </>;
  else if (step === 'manage') footer = <>
    <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => setStep('disable')}>{t('accountSecurity.turnOff')}</button>
    <button className="btn-primary btn-primary--sm" onClick={close} disabled={locked}>{t('buttons.done')}</button>
  </>;
  else if (step === 'error') footer = <button className="btn-primary btn-primary--sm" disabled={locked} onClick={() => run(load)}>{t('accountSecurity.retry')}</button>;

  return <Dialog title={t(title)} onCancel={close} dismissDisabled={locked} focusKey={`${step}:${status?.preferred_method || ''}`}
    footer={footer && <div className="app-dialog-actions app-dialog-actions--spread">{footer}</div>}>
    {inWizard && <ol className="security-setup-steps" aria-label={t('accountSecurity.setupProgress')}>
      {['chooseStep', 'verifyStep', 'backupStep'].map((label, index) => <li key={label}
        aria-current={currentStep === index + 1 ? 'step' : undefined} className={currentStep > index + 1 ? 'complete' : ''}>
        <span aria-hidden="true">{currentStep > index + 1 ? <i className="fa-solid fa-check" /> : index + 1}</span>{t(`accountSecurity.${label}`)}
      </li>)}
    </ol>}
    {step === 'loading' && <p role="status">{t('buttons.loading')}</p>}
    {step === 'choose' && <>
      <p>{t('accountSecurity.chooseIntro')}</p>
      <VerificationMethodPicker methods={choices} selected={selected} onSelect={setSelected} disabled={locked} setup />
      <p className="security-setup-note"><i className="fa-solid fa-shield-halved" aria-hidden="true" />{t('accountSecurity.backupLater')}</p>
    </>}
    {step === 'confirm' && <>
      <ConfirmationForm method={proof.method} methods={proof.methods} preferredMethod={proof.preferred_method}
        onComplete={afterConfirmation} onBusyChange={setConfirmBusy} />
    </>}
    {step === 'email' && <>
      <h3 className="security-step-title">{t('accountSecurity.verifyEmail')}</h3>
      <ConfirmationForm methods={[emailMethod]} preferredMethod="email_code" onBusyChange={setConfirmBusy}
        submitLabel="accountSecurity.enable" cancelLabel="buttons.back" description="accountSecurity.emailSetup"
        onComplete={async accepted => {
          if (!mounted.current) return;
          if (!accepted) { back(); return; }
          await run(async () => { if (await mutate('enable')) await showCodes(); });
        }} />
    </>}
    {step === 'email-change' && <>
      <p>{t('accountSecurity.emailDestinationHelp')}</p>
      <form id={formId} onSubmit={event => {
        event.preventDefault();
        run(async () => {
          if (await mutate('set_email_destination', { email: emailChoice, code: code.trim() })) { clearSecrets(); setStep('manage'); }
        }, { onExpired: async () => { clearSecrets(); setStep('email-change'); }, returnStep: 'email-change' });
      }}>
        <label className="form-label" htmlFor={`${codeId}-email`}>{t('accountSecurity.emailDestination')}</label>
        <select className="form-input" id={`${codeId}-email`} value={emailChoice} disabled={locked}
          onChange={event => { setEmailChoice(event.target.value); setEmailCodeSent(false); setCode(''); setError(''); }}>
          {emailChoices.map(choice => <option key={choice.email} value={choice.email} disabled={!choice.available}>
            {choice.email} ({t(`accountSecurity.emailSources.${choice.source}`)})
          </option>)}
        </select>
        {emailCodeSent && <div className="security-email-code">
          <p className="account-confirmation-notice" role="status">{t('accountSecurity.emailCodeSent', { email: emailChoice })}</p>
          <label className="form-label" htmlFor={codeId}>{t('accountConfirmation.codeLabel')}</label>
          <input className="form-input" id={codeId} value={code} onChange={event => setCode(event.target.value)}
            autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required disabled={locked} />
          <button type="button" className="account-confirmation-link" disabled={locked}
            onClick={() => run(() => mutate('send_email_destination_code', { email: emailChoice }))}>{t('accountConfirmation.resend')}</button>
        </div>}
      </form>
    </>}
    {step === 'setup' && <>
      <h3 className="security-step-title">{t('accountSecurity.connectApp')}</h3>
      <p>{t('accountSecurity.scan')}</p>
      <img className="security-setup-qr" src={qr} alt={t('accountSecurity.qrLabel')} />
      <form id={formId} onSubmit={event => {
        event.preventDefault();
        let activated = false;
        run(async () => {
          if (!await mutate('activate_totp', { code: code.trim() })) return;
          activated = true; setQr(''); setCode('');
          if (wizard) await showCodes();
          else setStep('manage');
        }, { onExpired: () => activated ? showCodes() : beginApp(), returnStep: wizard ? 'choose' : 'manage' });
      }}>
        <label className="form-label" htmlFor={codeId}>{t('accountSecurity.appCode')}</label>
        <input className="form-input" id={codeId} autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required
          value={code} onChange={event => setCode(event.target.value)} disabled={locked} />
      </form>
    </>}
    {step === 'manage' && <>
      <div className="security-enabled-status"><i className="fa-solid fa-shield-halved" aria-hidden="true" />{t('accountSecurity.on')}</div>
      <p>{t('accountSecurity.manageIntro')}</p>
      <div className="security-methods">
        <section className="security-method">
          <i className="fa-solid fa-envelope security-method-icon" aria-hidden="true" />
          <div className="security-method-info"><h3>{t('accountConfirmation.methods.email_code')}</h3>
            <p className="security-method-email">{emailMethod?.available ? status.email || t('accountSecurity.emailAvailable') : t('accountSecurity.emailUnavailable')}</p>
            {emailChoices.some(choice => choice.available && choice.email !== status.email) &&
              <button className="account-confirmation-link" disabled={locked} onClick={() => {
                clearSecrets(); setError('');
                setEmailChoice(emailChoices.find(choice => choice.available && choice.email !== status.email).email);
                setStep('email-change');
              }}>{t('accountSecurity.changeEmail')}</button>}
          </div>
          {status.preferred_method === 'email_code'
            ? <span className="security-method-status security-method-status--default" role="status">{t('accountSecurity.defaultMethod')}</span>
            : <button className="btn-secondary btn-secondary--sm" disabled={locked || !emailMethod?.available}
              onClick={() => selectMethod('email_code')}>{t(emailMethod?.available ? 'accountSecurity.useEmail' : 'accountSecurity.unavailable')}</button>}
        </section>
        <section className="security-method">
          <i className="fa-solid fa-mobile-screen-button security-method-icon" aria-hidden="true" />
          <div className="security-method-info"><h3>{t('accountConfirmation.methods.totp')}</h3>
            <p>{t(appConnected ? 'accountSecurity.appConnected' : 'accountSecurity.appNotConnected')}</p></div>
          <div className="security-method-actions">
            {status.preferred_method === 'totp'
              ? <span className="security-method-status security-method-status--default" role="status">{t('accountSecurity.defaultMethod')}</span>
              : appConnected && <button className="btn-secondary btn-secondary--sm" disabled={locked}
                onClick={() => selectMethod('totp')}>{t('accountSecurity.useApp')}</button>}
            <button className="btn-secondary btn-secondary--sm" disabled={locked}
              onClick={() => appConnected ? setStep('remove') : run(beginApp)}>{t(appConnected ? 'accountSecurity.removeApp' : 'accountSecurity.connectApp')}</button>
          </div>
        </section>
      </div>
      <section className="security-backup-section">
        <h3 className="security-step-title">{t('accountSecurity.recoveryTitle')}</h3>
        <p>{t('accountSecurity.recoveryAvailable', { count: status.recovery_count })} · {t('accountSecurity.backupOnly')}</p>
        <div className="security-method-actions">
          {status.recovery_count > 0 && <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => run(showCodes)}>{t('accountSecurity.viewCodes')}</button>}
          <button className="btn-secondary btn-secondary--sm" disabled={locked} onClick={() => setStep('regenerate')}>{t('accountSecurity.generateCodes')}</button>
        </div>
      </section>
    </>}
    {step === 'recovery' && <>
      {wizard && <div className="security-enabled-status" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" />{t('accountSecurity.enabledSuccess')}</div>}
      <p>{t('accountSecurity.saveCodes')}</p>
      {busy && !codes.length && <p role="status">{t('buttons.loading')}</p>}
      {codes.length > 0 && <ul className="security-backup-codes" aria-label={t('accountSecurity.recoveryTitle')}>
        {codes.map(value => <li key={value}><code>{value}</code></li>)}
      </ul>}
    </>}
    {destructive && <p>{t(`accountSecurity.${step}Confirm`)}</p>}
    {error && <p className="app-dialog-error" role="alert">{error}</p>}
  </Dialog>;
}
