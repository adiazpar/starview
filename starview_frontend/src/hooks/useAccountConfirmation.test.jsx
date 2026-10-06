import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAccountConfirmation from './useAccountConfirmation';
import authApi from '../services/auth';

vi.mock('../services/auth', () => ({ default: {
  getSecurityStatus: vi.fn(), confirmIdentity: vi.fn(), sendConfirmationCode: vi.fn(),
} }));
const identity = vi.hoisted(() => ({ user: { id: 1 } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => identity }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

function Example({ onChange, password }) {
  const confirmation = useAccountConfirmation();
  return <>{confirmation.dialog}<button onClick={async () => {
    if (await confirmation.confirm({ password })) onChange();
  }}>Change email</button></>;
}

beforeEach(() => {
  vi.clearAllMocks();
  identity.user = { id: 1 };
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  authApi.confirmIdentity.mockResolvedValue({ data: { recent: true } });
});

describe('account confirmation', () => {
  it('does not prompt again after a recent login', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: true, method: 'password' } });
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves the pending action through confirmation and submits it once', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: false, method: 'password' } });
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    const field = await screen.findByLabelText('accountConfirmation.passwordLabel');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'test-password' } });
    fireEvent.click(screen.getByText('accountConfirmation.confirm'));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(authApi.confirmIdentity).toHaveBeenCalledWith({ password: 'test-password' });
  });

  it('cancellation leaves the account unchanged and sends no email', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: false, method: 'email_code' } });
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    fireEvent.click(await screen.findByText('accountConfirmation.cancel'));
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(authApi.sendConfirmationCode).not.toHaveBeenCalled();
  });

  it('reuses the current-password input from the password-change form', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: false, method: 'password' } });
    const onChange = vi.fn();
    render(<Example onChange={onChange} password="already-entered" />);
    fireEvent.click(screen.getByText('Change email'));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(authApi.confirmIdentity).toHaveBeenCalledWith({ password: 'already-entered' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the pending action blocked after an incorrect code', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: false, method: 'mfa' } });
    authApi.confirmIdentity.mockRejectedValue({ response: { data: { detail: 'Incorrect code' } } });
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    fireEvent.change(await screen.findByLabelText('accountConfirmation.codeLabel'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('accountConfirmation.confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect code');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('does not authorize an action if its status request finishes after unmount', async () => {
    let finish;
    authApi.getSecurityStatus.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onChange = vi.fn();
    const view = render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    view.unmount();
    await act(async () => finish({ data: { recent: true } }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a pending confirmation when the account changes', async () => {
    authApi.getSecurityStatus.mockResolvedValue({ data: { recent: false, method: 'password' } });
    let finish;
    authApi.confirmIdentity.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onChange = vi.fn();
    const view = render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByText('Change email'));
    fireEvent.change(await screen.findByLabelText('accountConfirmation.passwordLabel'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByText('accountConfirmation.confirm'));
    identity.user = { id: 2 };
    view.rerender(<Example onChange={onChange} />);
    await act(async () => finish({ data: { recent: true } }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

});
