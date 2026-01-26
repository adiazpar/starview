import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { profileApi } from '../services/profile';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_CONFIG,
  LANGUAGE_STORAGE_KEY,
} from '../i18n/config';

/**
 * useLanguage - Unified language preference management
 *
 * For authenticated users: reads from user profile, syncs to backend
 * For guests: reads/writes to localStorage
 *
 * @returns {Object} Language preference state and utilities
 * @returns {string} language - Current language code ('en', 'es')
 * @returns {Function} setLanguage - Function to update preference
 * @returns {boolean} isUpdating - Whether a backend sync is in progress
 * @returns {Object} languageConfig - Metadata for current language
 * @returns {Array} supportedLanguages - List of supported language codes
 * @returns {Object} allLanguageConfigs - Metadata for all languages
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  // Initialize from localStorage (immediate, no flicker)
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return i18n.language || DEFAULT_LANGUAGE;
  });

  const [isUpdating, setIsUpdating] = useState(false);

  // Sync from user profile when authenticated
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && user?.language_preference) {
      const userLang = user.language_preference;
      if (SUPPORTED_LANGUAGES.includes(userLang)) {
        setLanguageState(userLang);
        // Also update i18next
        if (i18n.language !== userLang) {
          i18n.changeLanguage(userLang);
        }
        // Update localStorage for consistency
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, userLang);
        } catch {
          // Ignore localStorage errors
        }
      }
    }
  }, [isAuthenticated, user?.language_preference, authLoading, i18n]);

  // Listen for cross-tab/window sync
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === LANGUAGE_STORAGE_KEY && e.newValue) {
        if (SUPPORTED_LANGUAGES.includes(e.newValue)) {
          setLanguageState(e.newValue);
          i18n.changeLanguage(e.newValue);
        }
      }
    };

    // Custom event for same-tab sync
    const handleLanguageChange = (e) => {
      if (SUPPORTED_LANGUAGES.includes(e.detail)) {
        setLanguageState(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('languageChange', handleLanguageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [i18n]);

  // Set language with backend sync for authenticated users
  const setLanguage = useCallback(async (newLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(newLanguage)) return;
    if (newLanguage === language) return;

    // Optimistic update
    setLanguageState(newLanguage);

    // Update i18next
    await i18n.changeLanguage(newLanguage);

    // Update localStorage
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
    } catch {
      // Ignore localStorage errors
    }

    // Dispatch event for same-tab sync
    window.dispatchEvent(new CustomEvent('languageChange', { detail: newLanguage }));

    // Sync to backend if authenticated
    if (isAuthenticated) {
      setIsUpdating(true);
      try {
        await profileApi.updateLanguagePreference({ language_preference: newLanguage });
      } catch (error) {
        console.error('Failed to sync language preference:', error);
        // Don't revert - localStorage is the fallback
      } finally {
        setIsUpdating(false);
      }
    }
  }, [language, isAuthenticated, i18n]);

  // Get config for current language
  const languageConfig = useMemo(
    () => LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG[DEFAULT_LANGUAGE],
    [language]
  );

  return useMemo(() => ({
    language,
    setLanguage,
    isUpdating,
    languageConfig,
    supportedLanguages: SUPPORTED_LANGUAGES,
    allLanguageConfigs: LANGUAGE_CONFIG,
  }), [language, setLanguage, isUpdating, languageConfig]);
}

export default useLanguage;
