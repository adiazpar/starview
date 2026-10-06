import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSecurityDialog from './AccountSecurityDialog';
import authApi from '../../services/auth';

const { t } = vi.hoisted(() => ({ t: key => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
vi.mock('../../services/auth', () => ({ default: {
  getSecurityStatus: vi.fn(), getSecurityMethods: vi.fn(), updateSecurityMethods: vi.fn(),
  getRecoveryCodes: vi.fn(), confirmIdentity: vi.fn(), sendConfirmationCode: vi.fn(),
} }));
const methods = [
  { id: 'email_code', available: true, requires_delivery: true },
  { id: 'totp', available: false }, { id: 'recovery_codes', available: true },
];
const status = { enabled: true, required: false, methods, recovery_count: 10, preferred_method: 'email_code' };
const off = { ...status, enabled: false, recovery_count: 0 };
const proof = { recent: false, method: 'mfa', methods, preferred_method: 'email_code' };
const expired = { response: { status: 403 } };
const sampleCodes = ['1234567890', '0987654321'];

beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  authApi.getSecurityStatus.mockResolvedValue({ data: proof });
  authApi.getSecurityMethods.mockResolvedValue({ data: status });
  authApi.updateSecurityMethods.mockResolvedValue({ data: status });
  authApi.getRecoveryCodes.mockResolvedValue({ data: { codes: sampleCodes } });
  authApi.confirmIdentity.mockResolvedValue({ data: { recent: true } });
  authApi.sendConfirmationCode.mockResolvedValue({ data: {} });
});
const click = key => fireEvent.click(screen.getByRole('button', { name: key, exact: true }));
async function sendEmail() {
  click('accountConfirmation.send');
  await screen.findByLabelText('accountConfirmation.codeLabel');
}
async function enterCode(submit = 'accountConfirmation.confirm') {
  fireEvent.change(await screen.findByLabelText('accountConfirmation.codeLabel'), { target: { value: '123456' } });
  click(submit);
}

describe('security settings dialog', () => {
  it('opens enabled methods without sending mail or asking for proof', async () => {
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    await screen.findByText('accountSecurity.on');
    expect(screen.getByText('accountSecurity.appNotConnected')).toBeInTheDocument();
    expect(screen.queryByText('accountConfirmation.title')).not.toBeInTheDocument();
    expect(authApi.getSecurityStatus).not.toHaveBeenCalled();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
    expect(authApi.getRecoveryCodes).not.toHaveBeenCalled();
  });

  it('starts disabled accounts with method choices and makes leaving harmless', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    expect(await screen.findByRole('radio', { name: /methods.totp/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /methods.email_code/ })).toBeEnabled();
    expect(screen.queryByRole('radio', { name: /methods.recovery_codes/ })).not.toBeInTheDocument();
    // The header arrow is the only way out: no Cancel beside the primary action, and it closes here.
    expect(screen.queryByText('buttons.cancel')).not.toBeInTheDocument();
    click('buttons.close');
    expect(onClose).toHaveBeenCalledOnce();
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
  });

  it('verifies a new delivery address before updating it, without changing the default method', async () => {
    const withEmails = { ...status, email: 'main@example.test', email_choices: [
      { email: 'main@example.test', source: 'primary', available: true },
      { email: 'codes@example.test', source: 'google', available: true },
    ] };
    authApi.getSecurityMethods.mockResolvedValue({ data: withEmails });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: withEmails })
      .mockResolvedValueOnce({ data: { ...withEmails, email: 'codes@example.test' } });
    const onChanged = vi.fn();
    render(<AccountSecurityDialog onClose={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(await screen.findByText('accountSecurity.changeEmail'));
    expect(screen.getByLabelText('accountSecurity.emailDestination')).toHaveValue('codes@example.test');
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    click('accountConfirmation.send');
    fireEvent.change(await screen.findByLabelText('accountConfirmation.codeLabel'), { target: { value: '123456' } });
    expect(screen.getByRole('button', { name: 'accountConfirmation.resendIn' })).toBeDisabled();
    expect(onChanged).not.toHaveBeenCalled();
    click('buttons.save');
    await screen.findByText('accountSecurity.on');
    expect(authApi.updateSecurityMethods.mock.calls).toEqual([
      [{ action: 'send_email_destination_code', email: 'codes@example.test' }],
      [{ action: 'set_email_destination', email: 'codes@example.test', code: '123456' }],
    ]);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByText('codes@example.test')).toBeInTheDocument();
  });

  it('cancelling an email change leaves the existing address intact', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: { ...status, email: 'main@example.test', email_choices: [
      { email: 'main@example.test', source: 'primary', available: true },
      { email: 'codes@example.test', source: 'google', available: true },
    ] } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.changeEmail'));
    click('buttons.back');
    await screen.findByText('accountSecurity.on');
    expect(screen.getByText('main@example.test')).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
  });

  it('requests a fresh destination code after expired proof instead of replaying one', async () => {
    const withEmails = { ...status, email: 'main@example.test', email_choices: [
      { email: 'main@example.test', source: 'primary', available: true },
      { email: 'codes@example.test', source: 'google', available: true },
    ] };
    authApi.getSecurityMethods.mockResolvedValue({ data: withEmails });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: withEmails }).mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.changeEmail'));
    click('accountConfirmation.send');
    fireEvent.change(await screen.findByLabelText('accountConfirmation.codeLabel'), { target: { value: '123456' } });
    click('buttons.save');
    await screen.findByText('accountConfirmation.title');
    await sendEmail();
    await enterCode();
    await screen.findByLabelText('accountSecurity.emailDestination');
    expect(screen.queryByLabelText('accountConfirmation.codeLabel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'accountConfirmation.send' })).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).toHaveBeenCalledTimes(2);
  });

  it('switches the default both ways without removing the app or reading backup codes', async () => {
    const connected = { ...status, methods: methods.map(method => ({ ...method, available: true })) };
    authApi.getSecurityMethods.mockResolvedValue({ data: connected });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { ...connected, preferred_method: 'totp' } })
      .mockResolvedValueOnce({ data: connected });
    const onChanged = vi.fn();
    render(<AccountSecurityDialog onClose={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(await screen.findByText('accountSecurity.useApp'));
    fireEvent.click(await screen.findByText('accountSecurity.useEmail'));
    await screen.findByText('accountSecurity.useApp');
    expect(authApi.updateSecurityMethods.mock.calls).toEqual([
      [{ action: 'set_preferred_method', method: 'totp' }],
      [{ action: 'set_preferred_method', method: 'email_code' }],
    ]);
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(authApi.getSecurityStatus).not.toHaveBeenCalled();
    expect(authApi.getRecoveryCodes).not.toHaveBeenCalled();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
  });

  it('uses the existing default for expired proof before switching and resumes the switch', async () => {
    const connected = { ...status, preferred_method: 'totp', methods: methods.map(method => ({ ...method, available: true })) };
    authApi.getSecurityMethods.mockResolvedValue({ data: connected });
    authApi.getSecurityStatus.mockResolvedValue({ data: { ...proof, methods: connected.methods, preferred_method: 'totp' } });
    authApi.updateSecurityMethods.mockRejectedValueOnce(expired)
      .mockResolvedValueOnce({ data: { ...connected, preferred_method: 'email_code' } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.useEmail'));
    expect(await screen.findByRole('radio', { name: /methods.totp/ })).toBeChecked();
    click('accountConfirmation.useBackup');
    click('accountConfirmation.usePrimary');
    expect(screen.getByRole('radio', { name: /methods.totp/ })).toBeChecked();
    await enterCode();
    await screen.findByText('accountSecurity.useApp');
    expect(authApi.confirmIdentity).toHaveBeenCalledWith({ method: 'totp', code: '123456' });
    expect(authApi.updateSecurityMethods).toHaveBeenCalledTimes(2);
    expect(authApi.updateSecurityMethods).toHaveBeenLastCalledWith({ action: 'set_preferred_method', method: 'email_code' });
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
  });

  it('keeps the existing default on a failed switch', async () => {
    const connected = { ...status, methods: methods.map(method => ({ ...method, available: true })) };
    authApi.getSecurityMethods.mockResolvedValue({ data: connected });
    authApi.updateSecurityMethods.mockRejectedValue({ response: { status: 400, data: { detail: 'Method unavailable' } } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.useApp'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Method unavailable');
    expect(screen.queryByText('accountSecurity.useEmail')).not.toBeInTheDocument();
  });

  it('returns an enabled account to Manage after verifying its new app', async () => {
    const connected = { ...status, preferred_method: 'totp', methods: methods.map(method => ({ ...method, available: true })) };
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } })
      .mockResolvedValueOnce({ data: connected });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.connectApp'));
    fireEvent.change(await screen.findByLabelText('accountSecurity.appCode'), { target: { value: '123456' } });
    click('accountSecurity.connectApp');
    await screen.findByText('accountSecurity.useEmail');
    expect(screen.queryByAltText('accountSecurity.qrLabel')).not.toBeInTheDocument();
    expect(authApi.getRecoveryCodes).not.toHaveBeenCalled();
  });

  it('verifies email before enabling, then shows backup codes and Done', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    const onClose = vi.fn(), onChanged = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('radio', { name: /methods.email_code/ }));
    click('accountSecurity.next');
    expect(screen.queryByLabelText('accountConfirmation.codeLabel')).not.toBeInTheDocument();
    await sendEmail();
    authApi.confirmIdentity.mockRejectedValueOnce({ response: { data: { detail: 'Incorrect code' } } });
    await enterCode('accountSecurity.enable');
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect code');
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('accountSecurity.enable')).toBeEnabled());
    await enterCode('accountSecurity.enable');
    expect(await screen.findByText(sampleCodes[0])).toBeInTheDocument();
    expect(authApi.confirmIdentity).toHaveBeenLastCalledWith({ method: 'email_code', code: '123456' });
    expect(authApi.updateSecurityMethods).toHaveBeenCalledWith({ action: 'enable' });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByLabelText('accountConfirmation.codeLabel')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('buttons.done')).toBeEnabled());
    click('buttons.done');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps app setup and backups in the wizard and never enables on QR generation', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    expect(await screen.findByAltText('accountSecurity.qrLabel')).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).toHaveBeenCalledExactlyOnceWith({ action: 'begin_totp' });
    fireEvent.change(screen.getByLabelText('accountSecurity.appCode'), { target: { value: '123456' } });
    click('accountSecurity.enable');
    expect(await screen.findByText(sampleCodes[0])).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).toHaveBeenLastCalledWith({ action: 'activate_totp', code: '123456' });
    expect(screen.queryByAltText('accountSecurity.qrLabel')).not.toBeInTheDocument();
    // Success is a quiet inline status, never an alert or a boxed banner.
    expect(authApi.getSecurityStatus).not.toHaveBeenCalled();
    expect(authApi.confirmIdentity).not.toHaveBeenCalled();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
    expect(screen.getByText('accountSecurity.enabledSuccess').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts a pasted authenticator code and keeps the field a numeric one-time-code input', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    const field = await screen.findByLabelText('accountSecurity.appCode');
    expect(screen.getByRole('button', { name: 'accountSecurity.enable' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '123 456' } });
    expect(field).toHaveValue('123456');
    expect(screen.getByRole('button', { name: 'accountSecurity.enable' })).toBeEnabled();
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('confirms a sent code inline beside the field and sends a pasted code as six digits', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    await screen.findByText('accountConfirmation.title');
    await sendEmail();
    const field = screen.getByLabelText('accountConfirmation.codeLabel');
    const sent = screen.getByRole('status');
    expect(sent).toHaveTextContent('accountConfirmation.sent');
    expect(field.closest('form')).toContainElement(sent);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: '123 456' } });
    click('accountConfirmation.confirm');
    await screen.findByText(sampleCodes[0]);
    expect(authApi.confirmIdentity).toHaveBeenCalledWith({ method: 'email_code', code: '123456' });
  });

  it('confirms a saved default inline and clears it when leaving Manage', async () => {
    const connected = { ...status, methods: methods.map(method => ({ ...method, available: true })) };
    authApi.getSecurityMethods.mockResolvedValue({ data: connected });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { ...connected, preferred_method: 'totp' } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.useApp'));
    expect((await screen.findByText('accountSecurity.savedDefault')).closest('[role="status"]')).toBeInTheDocument();
    fireEvent.click(screen.getByText('accountSecurity.turnOff'));
    click('buttons.back');
    await screen.findByText('accountSecurity.on');
    expect(screen.queryByText('accountSecurity.savedDefault')).not.toBeInTheDocument();
  });

  it('explains a failed load inline and retries from the footer', async () => {
    authApi.getSecurityMethods.mockRejectedValueOnce(new Error('offline'));
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('accountSecurity.loadFailed');
    click('accountSecurity.retry');
    await screen.findByText('accountSecurity.on');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requests proof only when viewing protected codes, then resumes in the same modal', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    await screen.findByText('accountConfirmation.title');
    expect(screen.queryByRole('radio', { name: /methods.totp/ })).not.toBeInTheDocument();
    expect(screen.getByText('accountConfirmation.useBackup')).toBeInTheDocument();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
    await sendEmail();
    await enterCode();
    await screen.findByText(sampleCodes[0]);
    expect(authApi.getRecoveryCodes).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('keeps recovery codes a secondary alternative and never sends mail when selected', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    fireEvent.click(await screen.findByText('accountConfirmation.useBackup'));
    fireEvent.change(screen.getByLabelText('accountConfirmation.backupLabel'), { target: { value: sampleCodes[0] } });
    click('accountConfirmation.confirm');
    await screen.findByText(sampleCodes[0]);
    expect(authApi.confirmIdentity).toHaveBeenCalledWith({ method: 'recovery_codes', code: sampleCodes[0] });
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
  });

  it('requires a deliberate action before replacing backup codes', async () => {
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.generateCodes'));
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    click('accountSecurity.regenerateAction');
    await screen.findByText(sampleCodes[0]);
    expect(authApi.updateSecurityMethods).toHaveBeenCalledExactlyOnceWith({ action: 'regenerate_recovery' });
  });

  it('shows the rejection beside the app code field and returns the cursor to it', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } })
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: 'The authenticator code was not accepted.' } } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    const field = await screen.findByLabelText('accountSecurity.appCode');
    fireEvent.change(field, { target: { value: '000000' } });
    document.activeElement.blur();
    click('accountSecurity.enable');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The authenticator code was not accepted.');
    expect(field.closest('form')).toContainElement(alert);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', alert.id);
    expect(field).toHaveValue('000000');
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByAltText('accountSecurity.qrLabel')).toBeInTheDocument();
  });

  it('retries a failed backup read without repeating a completed enrollment', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } });
    authApi.getRecoveryCodes.mockRejectedValueOnce(new Error('offline'));
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    fireEvent.change(await screen.findByLabelText('accountSecurity.appCode'), { target: { value: '123456' } });
    click('accountSecurity.enable');
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByText('accountSecurity.retry')).toBeEnabled());
    click('accountSecurity.retry');
    await screen.findByText(sampleCodes[0]);
    expect(authApi.updateSecurityMethods).toHaveBeenCalledTimes(2);
    expect(authApi.getRecoveryCodes).toHaveBeenCalledTimes(2);
  });

  it('does not fetch private codes if the dialog is unmounted during enrollment', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } });
    let finish;
    const onChanged = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<AccountSecurityDialog onClose={vi.fn()} onChanged={onChanged} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    fireEvent.change(await screen.findByLabelText('accountSecurity.appCode'), { target: { value: '123456' } });
    click('accountSecurity.enable');
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    view.unmount();
    finish();
    await Promise.resolve();
    expect(authApi.getRecoveryCodes).not.toHaveBeenCalled();
  });

  it('returns to management when identity confirmation is cancelled', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    await screen.findByText('accountConfirmation.title');
    expect(screen.queryByText('accountConfirmation.cancel')).not.toBeInTheDocument();
    click('buttons.back');
    await screen.findByText('accountSecurity.on');
    expect(authApi.getRecoveryCodes).toHaveBeenCalledOnce();
    expect(authApi.confirmIdentity).not.toHaveBeenCalled();
  });

  it('asks before removing the connected app, then returns to Manage with it disconnected', async () => {
    const connected = { ...status, methods: methods.map(method => ({ ...method, available: true })) };
    authApi.getSecurityMethods.mockResolvedValue({ data: connected });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: status });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.removeApp'));
    expect(screen.getByText('accountSecurity.removeConfirm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'accountSecurity.removeTitle' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'accountSecurity.removeAction' })).not.toHaveFocus();
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    click('accountSecurity.removeAction');
    expect(await screen.findByText('accountSecurity.appNotConnected')).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).toHaveBeenCalledExactlyOnceWith({ action: 'remove_totp' });
    expect(screen.getByText('accountSecurity.connectApp')).toBeInTheDocument();
    expect(screen.getByText('accountSecurity.savedAppRemoved').closest('[role="status"]')).toBeInTheDocument();
  });

  it('asks before turning off, starts on the heading, and closes only after the deliberate action', async () => {
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    fireEvent.click(await screen.findByText('accountSecurity.turnOff'));
    expect(screen.getByText('accountSecurity.disableConfirm')).toBeInTheDocument();
    // With no Cancel in the footer, focus starts on the heading: the destructive action is never focused for the user.
    expect(screen.getByRole('heading', { name: 'accountSecurity.disableTitle' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'accountSecurity.disableAction' })).not.toHaveFocus();
    expect(screen.queryByText('buttons.cancel')).not.toBeInTheDocument();
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
    click('accountSecurity.disableAction');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(authApi.updateSecurityMethods).toHaveBeenCalledExactlyOnceWith({ action: 'disable' });
    expect(authApi.getSecurityStatus).not.toHaveBeenCalled();
    expect(authApi.confirmIdentity).not.toHaveBeenCalled();
  });

  it('keeps the resend control on cooldown after a code is sent', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    await screen.findByText('accountConfirmation.title');
    await sendEmail();
    expect(screen.getByRole('button', { name: 'accountConfirmation.resendIn' })).toBeDisabled();
    expect(authApi.sendConfirmationCode).toHaveBeenCalledOnce();
  });

  it('shows the server message and wait when sending codes is throttled', async () => {
    authApi.getRecoveryCodes.mockRejectedValueOnce(expired);
    authApi.sendConfirmationCode.mockRejectedValueOnce({ response: { status: 429, data: {
      detail: 'Please wait before requesting another confirmation code.', retry_after: 42,
    } } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    await screen.findByText('accountConfirmation.title');
    click('accountConfirmation.send');
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait before requesting another confirmation code.');
    expect(screen.getByRole('button', { name: 'accountConfirmation.sendIn' })).toBeDisabled();
  });

  it('shows the action error when fetching confirmation status also fails', async () => {
    authApi.getSecurityStatus.mockRejectedValue(new Error('offline'));
    authApi.getRecoveryCodes.mockRejectedValue({ response: { status: 403, data: { detail: 'Please sign in again.' } } });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.viewCodes'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in again.');
    await waitFor(() => expect(screen.getByText('buttons.done')).toBeEnabled());
  });
});

describe('header arrow', () => {
  const qr = { data: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } };
  const withEmails = { ...status, email: 'main@example.test', email_choices: [
    { email: 'main@example.test', source: 'primary', available: true },
    { email: 'codes@example.test', source: 'google', available: true },
  ] };
  const connected = { ...status, methods: methods.map(method => ({ ...method, available: true })) };

  it('closes first-level steps (Manage, a failed load) through the shared exit, labelled Close', async () => {
    const onClose = vi.fn();
    const view = render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByText('accountSecurity.on');
    click('buttons.close');
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    authApi.getSecurityMethods.mockRejectedValueOnce(new Error('offline'));
    render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByRole('alert');
    click('buttons.close');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('steps back from app setup to the method choice without enabling anything', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce(qr);
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    await screen.findByAltText('accountSecurity.qrLabel');
    expect(screen.queryByText('buttons.back')).not.toBeInTheDocument();
    click('buttons.back');
    expect(await screen.findByText('accountSecurity.chooseIntro')).toBeInTheDocument();
    expect(screen.queryByAltText('accountSecurity.qrLabel')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /methods.totp/ })).toBeChecked();
    expect(onClose).not.toHaveBeenCalled();
    expect(authApi.updateSecurityMethods).toHaveBeenCalledExactlyOnceWith({ action: 'begin_totp' });
  });

  it('steps back from email enrollment to the method choice and sends no mail', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('radio', { name: /methods.email_code/ }));
    click('accountSecurity.next');
    await screen.findByText('accountSecurity.emailSetup');
    expect(screen.queryByText('buttons.back')).not.toBeInTheDocument();
    click('buttons.back');
    expect(await screen.findByText('accountSecurity.chooseIntro')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /methods.email_code/ })).toBeChecked();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
  });

  it('returns to Manage from everything reached from Manage, without calling the backend', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: { ...withEmails, methods: connected.methods } });
    authApi.updateSecurityMethods.mockClear();
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    for (const open of ['accountSecurity.changeEmail', 'accountSecurity.removeApp', 'accountSecurity.generateCodes', 'accountSecurity.turnOff']) {
      fireEvent.click(await screen.findByText(open));
      expect(screen.queryByText('accountSecurity.on')).not.toBeInTheDocument();
      click('buttons.back');
      await screen.findByText('accountSecurity.on');
    }
    expect(authApi.updateSecurityMethods).not.toHaveBeenCalled();
  });

  it('returns from app setup opened in Manage to Manage', async () => {
    authApi.updateSecurityMethods.mockResolvedValueOnce(qr);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.connectApp'));
    await screen.findByAltText('accountSecurity.qrLabel');
    click('buttons.back');
    await screen.findByText('accountSecurity.on');
    expect(screen.queryByAltText('accountSecurity.qrLabel')).not.toBeInTheDocument();
  });

  it('leaves backup codes for Manage after enrollment, keeping the setup and forgetting the codes', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce(qr);
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    fireEvent.change(await screen.findByLabelText('accountSecurity.appCode'), { target: { value: '123456' } });
    click('accountSecurity.enable');
    await screen.findByText(sampleCodes[0]);
    click('buttons.back');
    await screen.findByText('accountSecurity.on');
    expect(screen.queryByText(sampleCodes[0])).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // Enrollment is not undone, and Manage no longer behaves like the setup wizard.
    expect(authApi.updateSecurityMethods.mock.calls.map(([payload]) => payload.action)).toEqual(['begin_totp', 'activate_totp']);
    expect(screen.queryByRole('list', { name: 'accountSecurity.setupProgress' })).not.toBeInTheDocument();
  });

  it('cancels a pending action when proof was requested and returns to the step it started from', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: withEmails });
    authApi.updateSecurityMethods.mockResolvedValueOnce({ data: withEmails }).mockRejectedValueOnce(expired);
    render(<AccountSecurityDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('accountSecurity.changeEmail'));
    click('accountConfirmation.send');
    fireEvent.change(await screen.findByLabelText('accountConfirmation.codeLabel'), { target: { value: '123456' } });
    click('buttons.save');
    await screen.findByText('accountConfirmation.title');
    click('buttons.back');
    // Back where the change began (not Manage), and the rejected change is not replayed.
    expect(await screen.findByLabelText('accountSecurity.emailDestination')).toBeInTheDocument();
    expect(authApi.updateSecurityMethods).toHaveBeenCalledTimes(2);
    expect(authApi.confirmIdentity).not.toHaveBeenCalled();
  });

  it('is blocked while a request is pending, like the X it replaces', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    let finish;
    authApi.updateSecurityMethods.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    const arrow = screen.getByRole('button', { name: 'buttons.close' });
    await waitFor(() => expect(arrow).toBeDisabled());
    fireEvent.click(arrow);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish(qr));
    await screen.findByAltText('accountSecurity.qrLabel');
    expect(screen.getByRole('button', { name: 'buttons.back' })).toBeEnabled();
  });

  it('keeps Escape as the shared dismissal, not a step back', async () => {
    authApi.getSecurityMethods.mockResolvedValue({ data: off });
    authApi.updateSecurityMethods.mockResolvedValueOnce(qr);
    const onClose = vi.fn();
    render(<AccountSecurityDialog onClose={onClose} />);
    await screen.findByText('accountSecurity.chooseIntro');
    click('accountSecurity.next');
    await screen.findByAltText('accountSecurity.qrLabel');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
