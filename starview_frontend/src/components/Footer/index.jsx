/**
 * Footer Component
 *
 * Site-wide footer with navigation, social links, and legal info.
 * Features observatory-themed aesthetic with glass-morphic styling.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import './styles.css';

const navigationLinks = {
  explore: [
    { label: 'Discover Locations', to: '/explore' },
    { label: 'Star Map', to: '/explore', soon: true },
    { label: 'Light Pollution Data', to: '/explore', soon: true },
  ],
  community: [
    { label: 'Top Contributors', to: '/explore', soon: true },
    { label: 'Recent Reviews', to: '/explore', soon: true },
    { label: 'Submit a Location', to: '/explore', soon: true },
  ],
  company: [
    { label: 'About Starview', to: '/about', soon: true },
    { label: 'Contact', to: '/contact', soon: true },
    { label: 'API', to: '/api', soon: true },
  ],
};

const socialLinks = [
  { icon: 'fa-brands fa-github', href: 'https://github.com', label: 'GitHub' },
  { icon: 'fa-brands fa-x-twitter', href: 'https://x.com', label: 'X (Twitter)' },
  { icon: 'fa-brands fa-discord', href: 'https://discord.com', label: 'Discord' },
  { icon: 'fa-brands fa-instagram', href: 'https://instagram.com', label: 'Instagram' },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();
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
        {/* Main footer content */}
        <div className="footer__content">
          {/* Brand section */}
          <div className="footer__brand">
            <Link to="/" className="footer__logo">
              <img
                src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
                alt="Starview"
                className="footer__logo-img"
              />
            </Link>
            <p className="footer__tagline">
              Discover the universe's best stargazing locations, curated by astronomers and night sky enthusiasts.
            </p>

            {/* Celestial coordinates decoration */}
            <div className="footer__coordinates">
              <span className="footer__coord">
                <i className="fa-solid fa-location-crosshairs" />
                Tracking {new Intl.NumberFormat().format(1200)}+ locations
              </span>
            </div>
          </div>

          {/* Navigation columns */}
          <nav className="footer__nav" aria-label="Footer navigation">
            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                <i className="fa-solid fa-compass" />
                Explore
              </h3>
              <ul className="footer__nav-list">
                {navigationLinks.explore.map((link) => (
                  <li key={link.label}>
                    {link.soon ? (
                      <span className="footer__nav-link footer__nav-link--disabled">
                        {link.label}
                        <span className="footer__soon-badge">Soon</span>
                      </span>
                    ) : (
                      <Link to={link.to} className="footer__nav-link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                <i className="fa-solid fa-users" />
                Community
              </h3>
              <ul className="footer__nav-list">
                {navigationLinks.community.map((link) => (
                  <li key={link.label}>
                    {link.soon ? (
                      <span className="footer__nav-link footer__nav-link--disabled">
                        {link.label}
                        <span className="footer__soon-badge">Soon</span>
                      </span>
                    ) : (
                      <Link to={link.to} className="footer__nav-link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer__nav-column">
              <h3 className="footer__nav-title">
                <i className="fa-solid fa-building" />
                Company
              </h3>
              <ul className="footer__nav-list">
                {navigationLinks.company.map((link) => (
                  <li key={link.label}>
                    {link.soon ? (
                      <span className="footer__nav-link footer__nav-link--disabled">
                        {link.label}
                        <span className="footer__soon-badge">Soon</span>
                      </span>
                    ) : (
                      <Link to={link.to} className="footer__nav-link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        {/* Support link */}
        <div className="footer__social">
          <span className="footer__social-label">Want to support Starview?</span>
          <a
            href="https://buymeacoffee.com/adiazpar"
            className="footer__support-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-solid fa-mug-hot" />
            <span>Buy me a coffee</span>
          </a>
        </div>

        {/* Bottom bar */}
        <div className="footer__bottom">
          <div className="footer__legal">
            <Link to="/privacy" className="footer__legal-link">Privacy Policy</Link>
            <span className="footer__legal-divider" />
            <Link to="/terms" className="footer__legal-link">Terms of Service</Link>
          </div>

          <p className="footer__copyright">
            <i className="fa-regular fa-copyright" />
            {currentYear} Starview. All rights reserved.
          </p>

          <div className="footer__status">
            <span className="footer__status-indicator" />
            <span className="footer__status-text">All systems operational</span>
          </div>
        </div>
      </div>

      {/* Decorative constellation pattern */}
      <div className="footer__constellation" aria-hidden="true">
        <svg viewBox="0 0 200 100" className="footer__constellation-svg">
          <circle cx="20" cy="30" r="1.5" />
          <circle cx="45" cy="15" r="1" />
          <circle cx="70" cy="40" r="1.5" />
          <circle cx="100" cy="25" r="2" />
          <circle cx="130" cy="45" r="1" />
          <circle cx="160" cy="20" r="1.5" />
          <circle cx="180" cy="50" r="1" />
          <line x1="20" y1="30" x2="45" y2="15" />
          <line x1="45" y1="15" x2="70" y2="40" />
          <line x1="70" y1="40" x2="100" y2="25" />
          <line x1="100" y1="25" x2="130" y2="45" />
          <line x1="130" y1="45" x2="160" y2="20" />
          <line x1="160" y1="20" x2="180" y2="50" />
        </svg>
      </div>
    </footer>
  );
}
