import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrivacySection from './index';
import profileApi from '../../../services/profile';
import { english } from '../../../__tests__/birthDateTestUtils';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => english(key) }) }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../services/profile', () => {
  const profileApi = { updatePrivacy: vi.fn() };
  return { profileApi, default: profileApi };
});

// Stands in for the server and AuthContext: the account on screen changes only when it is refetched.
const server = { isPrivate: false };
const DESCRIPTION = 'Choose whether you want your profile to be private.';
const FAILED = 'We couldn’t save your privacy preference. Please try again.';

function Account({ initial, refreshAuth }) {
  const [user, setUser] = useState(initial);
  const refresh = async () => {
    await refreshAuth();
    setUser({ ...initial, is_private: server.isPrivate });
  };
  return <PrivacySection user={user} refreshAuth={refresh} />;
}

const control = () => screen.getByRole('switch', { name: 'Private profile' });
const failure = extra => Object.assign(new Error('Request failed'), extra);
const deferred = () => {
  const request = {};
  request.promise = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject; });
  return request;
};
// Stubbed rather than cleared, so the check does not depend on which Storage the Node/jsdom combination provides.
const memoryStorage = () => {
  const items = new Map();
  return {
    get length() { return items.size; },
    getItem: key => items.get(key) ?? null,
    setItem: vi.fn((key, value) => { items.set(key, String(value)); }),
    removeItem: key => { items.delete(key); },
    clear: () => items.clear(),
    key: index => [...items.keys()][index] ?? null,
  };
};

function renderSection({ account = { id: 7, is_private: false }, refreshAuth = vi.fn().mockResolvedValue(), open = true } = {}) {
  server.isPrivate = account.is_private === true;
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Account initial={account} refreshAuth={refreshAuth} /></QueryClientProvider>);
  if (open) fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
  return { refreshAuth };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  profileApi.updatePrivacy.mockReset().mockImplementation(async ({ is_private }) => {
    server.isPrivate = is_private;
    return { data: { detail: 'Profile privacy preference updated.', is_private } };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the saved value', () => {
  it('is a Privacy section that starts collapsed like the other settings', () => {
    renderSection({ open: false });
    const header = screen.getByRole('button', { name: 'Privacy' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(control()).toBeInTheDocument();
  });

  it.each([
    [true, 'true', 'On'],
    [false, 'false', 'Off'],
    [undefined, 'false', 'Off'],
    [null, 'false', 'Off'],
  ])('starts from the account value %j', (value, checked, status) => {
    renderSection({ account: { id: 7, is_private: value } });
    expect(control()).toHaveAttribute('aria-checked', checked);
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(control()).not.toHaveAttribute('aria-disabled');
  });

  it('follows the account it is given instead of keeping its own copy', () => {
    const client = new QueryClient();
    const page = user => <QueryClientProvider client={client}><PrivacySection user={user} refreshAuth={vi.fn()} /></QueryClientProvider>;
    const view = render(page({ id: 7, is_private: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(control()).toHaveAttribute('aria-checked', 'false');
    view.rerender(page({ id: 7, is_private: true }));
    expect(control()).toHaveAttribute('aria-checked', 'true');
  });

  it('is named by its label and described by the line beneath it', () => {
    renderSection();
    expect(control()).toHaveAccessibleDescription(DESCRIPTION);
  });
});

describe('saving', () => {
  it('saves a private profile, refetches the account, then shows and confirms it', async () => {
    const { refreshAuth } = renderSection();
    fireEvent.click(control());
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    expect(showToast).toHaveBeenCalledWith('Privacy preference saved', 'success');
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();
    expect(profileApi.updatePrivacy).toHaveBeenCalledWith({ is_private: true });
    expect(refreshAuth).toHaveBeenCalledOnce();
    expect(profileApi.updatePrivacy.mock.invocationCallOrder[0]).toBeLessThan(refreshAuth.mock.invocationCallOrder[0]);
    await waitFor(() => expect(control()).not.toHaveAttribute('aria-disabled'));
    expect(control()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('saves a public profile when private is turned off', async () => {
    renderSection({ account: { id: 7, is_private: true } });
    fireEvent.click(control());
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();
    expect(profileApi.updatePrivacy).toHaveBeenCalledWith({ is_private: false });
    await waitFor(() => expect(control()).not.toHaveAttribute('aria-disabled'));
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('keeps nothing in browser storage', async () => {
    renderSection();
    fireEvent.click(control());
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.length).toBe(0);
    }
  });
});

describe('while a save is pending', () => {
  it('keeps the saved value and focus, says Saving…, and sends one request however often it is activated', async () => {
    const request = deferred();
    profileApi.updatePrivacy.mockReturnValue(request.promise);
    renderSection();
    control().focus();
    // These land before React has reported the pending state.
    fireEvent.click(control());
    fireEvent.click(control());
    fireEvent.click(control());
    await waitFor(() => expect(control()).toHaveAttribute('aria-disabled', 'true'));
    expect(control()).toHaveAttribute('aria-busy', 'true');
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(control()).toHaveFocus();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
    fireEvent.click(control());
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();

    server.isPrivate = true;
    request.resolve({ data: { detail: 'Profile privacy preference updated.', is_private: true } });
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    await waitFor(() => expect(control()).not.toHaveAttribute('aria-disabled'));
    expect(control()).toHaveAttribute('aria-checked', 'true');
    expect(control()).toHaveFocus();
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();
  });

  it('stays locked until the refetched account arrives, not just until the server answers', async () => {
    const refetch = deferred();
    const refreshAuth = vi.fn(() => refetch.promise);
    renderSection({ refreshAuth });
    fireEvent.click(control());
    await waitFor(() => expect(refreshAuth).toHaveBeenCalledOnce());
    await waitFor(() => expect(control()).toHaveAttribute('aria-disabled', 'true'));
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(showToast).not.toHaveBeenCalled();
    fireEvent.click(control());
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();

    refetch.resolve();
    await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(control()).not.toHaveAttribute('aria-disabled'));
    expect(showToast).toHaveBeenCalledOnce();
    expect(profileApi.updatePrivacy).toHaveBeenCalledOnce();
  });
});

describe('when saving fails', () => {
  it('keeps the saved value, says so, and does not claim success', async () => {
    profileApi.updatePrivacy.mockRejectedValue(failure({ response: { status: 500, data: { detail: 'Server error.' } } }));
    const { refreshAuth } = renderSection();
    fireEvent.click(control());
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED);
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(control()).not.toHaveAttribute('aria-disabled');
    expect(control()).toHaveAccessibleDescription(new RegExp(FAILED));
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps a private profile private when turning it off fails', async () => {
    profileApi.updatePrivacy.mockRejectedValue(failure({ response: { status: 429 } }));
    renderSection({ account: { id: 7, is_private: true } });
    fireEvent.click(control());
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED);
    expect(control()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('lets the person try again, and the retry clears the message', async () => {
    profileApi.updatePrivacy.mockRejectedValueOnce(failure({ message: 'Network Error' }));
    renderSection();
    fireEvent.click(control());
    await screen.findByRole('alert');
    fireEvent.click(control());
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'true'));
    expect(profileApi.updatePrivacy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays quiet when an account change or expired session cancelled the request', async () => {
    const request = deferred();
    profileApi.updatePrivacy.mockReturnValue(request.promise);
    renderSection();
    fireEvent.click(control());
    await waitFor(() => expect(control()).toHaveAttribute('aria-disabled', 'true'));
    request.reject(failure({ code: 'ERR_CANCELED' }));
    await waitFor(() => expect(control()).not.toHaveAttribute('aria-disabled'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(showToast).not.toHaveBeenCalled();
  });
});
