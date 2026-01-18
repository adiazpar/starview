/* Cookie Consent Context
 * Provides shared cookie consent state across all components.
 * Ensures banner visibility updates immediately when preferences change.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CONSENT_KEY = 'cookie_consent';
const GA_MEASUREMENT_ID = 'G-69FRLLFMDK';

// Consent states
export const CONSENT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};

const CookieConsentContext = createContext(null);

// Load Google Analytics script dynamically
function loadGoogleAnalytics() {
  if (window.gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}

// Remove Google Analytics
function removeGoogleAnalytics() {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const name = cookie.split('=')[0].trim();
    if (name.startsWith('_ga') || name.startsWith('_gid')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
  }
  delete window.gtag;
  window.dataLayer = [];
}

export function CookieConsentProvider({ children }) {
  const [consentStatus, setConsentStatus] = useState(() => {
    if (typeof window === 'undefined') return CONSENT_STATUS.PENDING;
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored || CONSENT_STATUS.PENDING;
  });

  // Load GA if consent was previously given
  useEffect(() => {
    if (consentStatus === CONSENT_STATUS.ACCEPTED) {
      loadGoogleAnalytics();
    }
  }, [consentStatus]);

  const acceptCookies = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, CONSENT_STATUS.ACCEPTED);
    setConsentStatus(CONSENT_STATUS.ACCEPTED);
    loadGoogleAnalytics();
  }, []);

  const declineCookies = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, CONSENT_STATUS.DECLINED);
    setConsentStatus(CONSENT_STATUS.DECLINED);
    removeGoogleAnalytics();
  }, []);

  const resetConsent = useCallback(() => {
    localStorage.removeItem(CONSENT_KEY);
    setConsentStatus(CONSENT_STATUS.PENDING);
    removeGoogleAnalytics();
  }, []);

  const value = {
    consentStatus,
    isPending: consentStatus === CONSENT_STATUS.PENDING,
    hasAccepted: consentStatus === CONSENT_STATUS.ACCEPTED,
    hasDeclined: consentStatus === CONSENT_STATUS.DECLINED,
    acceptCookies,
    declineCookies,
    resetConsent,
  };

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
}
