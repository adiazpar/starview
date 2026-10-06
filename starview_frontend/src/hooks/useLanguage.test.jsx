import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLanguage } from './useLanguage';

const mocks = vi.hoisted(() => ({
  i18n: { language: 'es', changeLanguage: vi.fn() },
  auth: { isAuthenticated: false, user: null, loading: false, refreshAuth: vi.fn() },
  update: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: mocks.i18n }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/profile', () => ({ profileApi: { updateLanguagePreference: mocks.update } }));
vi.mock('../i18n/config', () => ({ SUPPORTED_LANGUAGES: ['en', 'es', 'pt-BR'], DEFAULT_LANGUAGE: 'en',
  LANGUAGE_STORAGE_KEY: 'starview_language', LANGUAGE_CONFIG: { en: {}, es: {}, 'pt-BR': {} } }));

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  document.cookie = 'django_language=; Max-Age=0; Path=/';
  mocks.auth.isAuthenticated = false; mocks.auth.user = null;
  mocks.i18n.language = 'es';
  mocks.i18n.changeLanguage.mockResolvedValue(); mocks.update.mockResolvedValue();
});

describe('explicit language preferences', () => {
  it('uses the browser-detected language without creating a preference', () => {
    const { result } = renderHook(useLanguage);
    expect(result.current.language).toBe('es');
    expect(localStorage.getItem('starview_language')).toBeNull();
  });

  it('saves selecting the currently detected language as an explicit choice', async () => {
    const { result } = renderHook(useLanguage);
    await act(() => result.current.setLanguage('es'));
    expect(localStorage.getItem('starview_language')).toBe('es');
    expect(document.cookie).toContain('django_language=es');
  });

  it('keeps an explicit choice when the browser language differs', () => {
    localStorage.setItem('starview_language', 'en');
    const { result } = renderHook(useLanguage);
    expect(result.current.language).toBe('en');
  });

  it('refreshes the profile after saving a new authenticated preference', async () => {
    mocks.auth.isAuthenticated = true; mocks.auth.user = { language_preference: 'en' };
    const { result } = renderHook(useLanguage);
    await act(() => result.current.setLanguage('pt-BR'));
    expect(mocks.update).toHaveBeenCalledWith({ language_preference: 'pt-BR' });
    expect(mocks.auth.refreshAuth).toHaveBeenCalledOnce();
  });
});
