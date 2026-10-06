import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import api from './api';
import { advanceIdentityEpoch } from './identityEpoch';

describe('late account responses', () => {
  it.each([200, 401])('discards an old %s response without signing out the next account', async status => {
    let finish;
    const unauthorized = vi.fn();
    window.addEventListener('auth:unauthorized', unauthorized);
    const request = api.get('/users/me/', { adapter: config => new Promise((resolve, reject) => {
      finish = () => status === 200
        ? resolve({ status, data: { email: 'old@example.test' }, config })
        : reject(new axios.AxiosError('expired', 'ERR_BAD_REQUEST', config, null, { status, config }));
    }) });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    advanceIdentityEpoch();
    finish();
    await expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener('auth:unauthorized', unauthorized);
  });
});
