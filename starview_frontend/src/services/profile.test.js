import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import profileApi from './profile';

vi.mock('./api', () => ({ default: { patch: vi.fn(), post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); });

describe('private date of birth requests', () => {
  it('saves a YYYY-MM-DD date through the owner-only endpoint', async () => {
    const response = { data: { detail: 'Date of birth updated.', birth_date: '1990-03-14' } };
    api.patch.mockResolvedValue(response);
    await expect(profileApi.updateBirthDate({ birth_date: '1990-03-14' })).resolves.toBe(response);
    expect(api.patch).toHaveBeenCalledOnce();
    expect(api.patch).toHaveBeenCalledWith('/users/me/update-birth-date/', { birth_date: '1990-03-14' });
  });

  it('dismisses the sign-in prompt with a bodiless POST', async () => {
    api.post.mockResolvedValue({ data: { detail: 'Date of birth reminder dismissed.' } });
    await profileApi.dismissBirthDatePrompt();
    expect(api.post).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledWith('/users/me/dismiss-birth-date-prompt/');
  });
});

describe('profile privacy preference request', () => {
  it.each([true, false])('saves %s as a JSON boolean through the owner-only endpoint', async isPrivate => {
    const response = { data: { detail: 'Profile privacy preference updated.', is_private: isPrivate } };
    api.patch.mockResolvedValue(response);
    await expect(profileApi.updatePrivacy({ is_private: isPrivate })).resolves.toBe(response);
    expect(api.patch).toHaveBeenCalledOnce();
    // The server rejects strings, numbers and null, so the value must reach it exactly as given.
    expect(api.patch).toHaveBeenCalledWith('/users/me/update-privacy/', { is_private: isPrivate });
  });

  it('lets a failed request reach the caller instead of swallowing it', async () => {
    const failure = Object.assign(new Error('Request failed'), { response: { status: 400 } });
    api.patch.mockRejectedValue(failure);
    await expect(profileApi.updatePrivacy({ is_private: true })).rejects.toBe(failure);
  });
});
