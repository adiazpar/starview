import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import authApi from '../services/auth';

vi.mock('../services/auth', () => ({ default: { checkStatus: vi.fn() } }));

let visibleClient;
function Account() {
  const { user } = useAuth();
  visibleClient = useQueryClient();
  return <p>{user?.username ?? 'anonymous'}</p>;
}
const account = (id, username) => ({ data: { authenticated: true, user: { id, username } } });

beforeEach(() => { vi.clearAllMocks(); });

describe('identity cache boundary', () => {
  it('isolates late optimistic rollbacks from the next account', async () => {
    authApi.checkStatus.mockResolvedValue(account(1, 'first'));
    render(<AuthProvider><Account /></AuthProvider>);
    await screen.findByText('first');
    const previousClient = visibleClient;
    previousClient.setQueryData(['profile'], { email: 'private-first@example.test' });
    authApi.checkStatus.mockResolvedValue(account(2, 'second'));
    fireEvent.focus(window);
    await screen.findByText('second');
    expect(visibleClient).not.toBe(previousClient);
    expect(visibleClient.getQueryData(['profile'])).toBeUndefined();
    previousClient.setQueryData(['profile'], { email: 'late-first@example.test' });
    expect(visibleClient.getQueryData(['profile'])).toBeUndefined();
  });

  it('ignores an old status result and keeps the current account cache', async () => {
    let finish;
    authApi.checkStatus.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<AuthProvider><Account /></AuthProvider>);
    authApi.checkStatus.mockResolvedValue(account(2, 'current'));
    fireEvent.focus(window);
    await screen.findByText('current');
    const currentClient = visibleClient;
    currentClient.setQueryData(['profile'], { email: 'current@example.test' });
    await act(async () => finish(account(1, 'old')));
    await waitFor(() => expect(screen.getByText('current')).toBeInTheDocument());
    expect(visibleClient).toBe(currentClient);
    expect(currentClient.getQueryData(['profile']).email).toBe('current@example.test');
  });
});
