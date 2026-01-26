/**
 * Footer Component
 *
 * Site-wide footer with navigation, social links, and legal info.
 * Features observatory-themed aesthetic with glass-morphic styling.
 * Hipcamp-inspired layout with isolated logo and clean sections.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import CookiePreferencesButton from '../CookieConsent/CookiePreferencesButton';
import LocaleSelector from '../LocaleSelector';
import './styles.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation('footer');
  const { theme } = useTheme();
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const effectiveTheme = theme === 'auto'
    ? (systemPrefersDark ? 'dark' : 'light')
    : theme;

  return (
    <footer className="footer">
      {/* Decorative top border with glow */}
      <div className="footer__glow-line" />

      <div className="footer__container">
        {/* Logo at top */}
        <div className="footer__brand">
          <Link to="/" className="footer__logo">
            <img
              src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
              alt="Starview"
              className="footer__logo-img"
            />
          </Link>
        </div>

        {/* Main footer content */}
        <div className="footer__content">
          {/* Navigation columns */}
          <nav className="footer__nav" aria-label="Footer navigation">
            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                {t('nav.explore.title')}
              </h3>
              <ul className="footer__nav-list">
                <li>
                  <Link to="/explore" className="footer__nav-link">
                    {t('nav.explore.discoverLocations')}
                  </Link>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.explore.starMap')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
                <li>
                  <Link to="/bortle" className="footer__nav-link">
                    {t('nav.explore.lightPollutionData')}
                  </Link>
                </li>
              </ul>
            </div>

            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                {t('nav.sky.title')}
              </h3>
              <ul className="footer__nav-list">
                <li>
                  <Link to="/sky" className="footer__nav-link">
                    {t('nav.sky.skyConditions')}
                  </Link>
                </li>
                <li>
                  <Link to="/tonight" className="footer__nav-link">
                    {t('nav.sky.tonightsForecast')}
                  </Link>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.sky.sevenDayForecast')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.sky.moonCalendar')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                {t('nav.community.title')}
              </h3>
              <ul className="footer__nav-list">
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.community.topContributors')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.community.recentReviews')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.community.submitLocation')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                {t('nav.company.title')}
              </h3>
              <ul className="footer__nav-list">
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.company.aboutStarview')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
                <li>
                  <a href="mailto:contact@starview.app" className="footer__nav-link">
                    {t('nav.company.contact')}
                  </a>
                </li>
                <li>
                  <span className="footer__nav-link footer__nav-link--disabled">
                    {t('nav.company.api')}
                    <span className="footer__soon-badge">{t('soon', { ns: 'common' })}</span>
                  </span>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {/* Support section - centered */}
        <div className="footer__support">
          <span className="footer__support-label">{t('support.label')}</span>
          <a
            href="https://buymeacoffee.com/adiazpar"
            className="footer__support-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-solid fa-mug-hot" />
            <span>{t('support.buyMeCoffee')}</span>
          </a>
        </div>

        {/* Bottom bar */}
        <div className="footer__bottom">
          <div className="footer__bottom-left">
            <LocaleSelector />
            <div className="footer__legal">
              <Link to="/privacy" className="footer__legal-link">{t('legal.privacy')}</Link>
              <Link to="/terms" className="footer__legal-link">{t('legal.terms')}</Link>
              <Link to="/accessibility" className="footer__legal-link">{t('legal.accessibility')}</Link>
              <CookiePreferencesButton className="footer__legal-link footer__legal-button" />
              <a href="/llms.txt" className="footer__legal-link">{t('legal.llms')}</a>
            </div>
          </div>

          <p className="footer__copyright">
            <i className="fa-regular fa-copyright" />
            {t('copyright', { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  );
}
