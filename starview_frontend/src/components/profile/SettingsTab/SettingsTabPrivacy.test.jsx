import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsTab from './index';
import profileApi from '../../../services/profile';
import { english } from '../../../__tests__/birthDateTestUtils';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => english(key) }) }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../services/profile', () => {
  const profileApi = { updatePrivacy: vi.fn() };
  return { profileApi, default: profileApi };
});
// The other sections have their own tests; the real Privacy section is what is under test here.
vi.mock('../ProfileSettings', () => ({ default: () => null }));
vi.mock('../PreferencesSection', () => ({ default: () => null }));
vi.mock('../ConnectedAccountsSection', () => ({ default: () => null }));
vi.mock('../AccountSecurityDialog', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  profileApi.updatePrivacy.mockResolvedValue({ data: { detail: 'Profile privacy preference updated.', is_private: true } });
});

describe('privacy preference in the Settings tab', () => {
  it('saves for the account and uses the refresh the profile page passes in', async () => {
    const refreshAuth = vi.fn().mockResolvedValue();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><SettingsTab user={{ id: 3, mfa_enabled: false, is_private: false }} refreshAuth={refreshAuth} /></MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    const control = screen.getByRole('switch', { name: 'Private profile' });
    expect(control).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(control);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Privacy preference saved', 'success'));
    expect(profileApi.updatePrivacy).toHaveBeenCalledWith({ is_private: true });
    expect(refreshAuth).toHaveBeenCalledOnce();
  });
});
