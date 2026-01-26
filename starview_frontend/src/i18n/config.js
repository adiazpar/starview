/**
 * i18n Configuration
 *
 * Configures i18next for internationalization with:
 * - Lazy loading of translation files from /locales/
 * - Browser language detection with localStorage fallback
 * - Support for multiple languages
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'ja', 'de', 'pt-BR', 'zh-CN', 'ko', 'it'];
export const DEFAULT_LANGUAGE = 'en';

// Language metadata for UI display
export const LANGUAGE_CONFIG = {
  en: {
    name: 'English',
    nativeName: 'English',
    flag: 'us',
    region: 'USA',
  },
  es: {
    name: 'Spanish',
    nativeName: 'Español',
    flag: 'es',
    region: 'España',
  },
  fr: {
    name: 'French',
    nativeName: 'Français',
    flag: 'fr',
    region: 'France',
  },
  ja: {
    name: 'Japanese',
    nativeName: '日本語',
    flag: 'jp',
    region: '日本',
  },
  de: {
    name: 'German',
    nativeName: 'Deutsch',
    flag: 'de',
    region: 'Deutschland',
  },
  'pt-BR': {
    name: 'Portuguese',
    nativeName: 'Português',
    flag: 'br',
    region: 'Brasil',
  },
  'zh-CN': {
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    flag: 'cn',
    region: '中国',
  },
  ko: {
    name: 'Korean',
    nativeName: '한국어',
    flag: 'kr',
    region: '대한민국',
  },
  it: {
    name: 'Italian',
    nativeName: 'Italiano',
    flag: 'it',
    region: 'Italia',
  },
};

// Storage key for language preference
export const LANGUAGE_STORAGE_KEY = 'starview_language';

i18n
  // Load translations from /locales/ directory
  .use(HttpBackend)
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Supported languages
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: DEFAULT_LANGUAGE,

    // Default namespace
    defaultNS: 'common',
    ns: ['common', 'footer', 'navbar'],

    // Language detection options
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator'],
      // Storage key for localStorage
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      // Cache user language in localStorage
      caches: ['localStorage'],
    },

    // Backend options for loading translations
    backend: {
      // Path to translation files
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    // React-specific options
    react: {
      // Wait for translations to load before rendering
      useSuspense: true,
    },

    // Interpolation options
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },

    // Debug mode (disabled in production)
    debug: false,
  });

export default i18n;
