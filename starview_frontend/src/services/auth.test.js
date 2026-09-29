import { afterEach, describe, expect, it, vi } from 'vitest';
import authApi from './auth';
import api from './api';

vi.mock('./api', () => ({ default: { get: vi.fn() } }));

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('Apple sign-in navigation', () => {
  it('submits a fresh CSRF token with the link intent and return path', async () => {
    api.get.mockResolvedValue({ data: { apple: true, csrf_token: 'test-csrf' } });
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function () {
      expect(this.method).toBe('post');
      expect(this.getAttribute('action')).toBe('/accounts/apple/login/');
      expect(Object.fromEntries(new FormData(this))).toEqual({
        process: 'connect', next: '/profile?social_connected=true', csrfmiddlewaretoken: 'test-csrf',
      });
    });
    await authApi.startAppleLogin({ process: 'connect', next: '/profile?social_connected=true' });
    expect(submit).toHaveBeenCalledOnce();
    expect(document.querySelector('form')).not.toBeNull();
    expect(document.querySelector('form').hidden).toBe(true);
  });

  it.each(['https://example.test', '//example.test', '/\\example.test'])('rejects external return path %s', async next => {
    api.get.mockResolvedValue({ data: { apple: true, csrf_token: 'test-csrf' } });
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function () {
      expect(new FormData(this).get('next')).toBe('/');
    });
    await authApi.startAppleLogin({ next });
  });

  it('does not navigate when credentials are not configured', async () => {
    api.get.mockResolvedValue({ data: { apple: false } });
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit');
    await expect(authApi.startAppleLogin()).rejects.toThrow('unavailable');
    expect(submit).not.toHaveBeenCalled();
  });
});
