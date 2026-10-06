import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from './index';
import authApi from '../../services/auth';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../services/auth', () => ({ default: { resendVerificationEmail: vi.fn() } }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, loading: false }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

beforeEach(() => { vi.clearAllMocks(); });

describe('verification email resend', () => {
  const renderPage = () => render(<MemoryRouter initialEntries={['/verify-email?email=preview%40example.test']}>
    <VerifyEmailPage />
  </MemoryRouter>);

  it('uses the shared transport and server cooldown without disclosing account status', async () => {
    const detail = 'If this address needs verification, a link will be sent.';
    authApi.resendVerificationEmail.mockResolvedValue({ data: { detail, resend_after: 180 } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByRole('button', { name: 'Resend in 180s' })).toBeDisabled();
    expect(authApi.resendVerificationEmail).toHaveBeenCalledWith({ email: 'preview@example.test' });
    expect(showToast).toHaveBeenCalledWith(detail, 'success');
    expect(screen.queryByText('Already verified')).not.toBeInTheDocument();
  });

  it('respects a server throttle and offers another attempt after ordinary failures', async () => {
    authApi.resendVerificationEmail.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByRole('button', { name: 'Resend verification email' })).toBeEnabled();
    authApi.resendVerificationEmail.mockRejectedValueOnce({ response: { data: { detail: 'Please wait.', retry_after: 42 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByRole('button', { name: 'Resend in 42s' })).toBeDisabled();
    expect(showToast).toHaveBeenLastCalledWith('Please wait.', 'error');
  });
});
