/* Cookie Consent Banner
 * GDPR-compliant consent banner for analytics cookies.
 * Appears at bottom of screen until user makes a choice.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCookieConsent } from '../../contexts/CookieConsentContext';
import './styles.css';

export default function CookieConsent() {
  const { isPending, acceptCookies, declineCookies } = useCookieConsent();
  const [isClosing, setIsClosing] = useState(false);

  // Don't render if user has already made a choice and animation is complete
  if (!isPending && !isClosing) return null;

  const handleChoice = (action) => {
    setIsClosing(true);
    // Wait for animation to complete before updating state
    setTimeout(() => {
      action();
      setIsClosing(false);
    }, 300);
  };

  return (
    <div
      className={`cookie-consent ${isClosing ? 'cookie-consent--closing' : ''}`}
      role="dialog"
      aria-label="Cookie consent"
    >
      {/* Mobile header with close button and title */}
      <div className="cookie-consent__header">
        <button
          className="cookie-consent__close cookie-consent__close--mobile"
          onClick={() => handleChoice(declineCookies)}
          aria-label="Decline cookies"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        <span className="cookie-consent__title">Cookie Preferences</span>
        <div className="cookie-consent__spacer"></div>
      </div>

      <div className="cookie-consent__container">
        {/* Desktop close button */}
        <button
          className="cookie-consent__close cookie-consent__close--desktop"
          onClick={() => handleChoice(declineCookies)}
          aria-label="Decline cookies"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="cookie-consent__content">
          <div className="cookie-consent__icon">
            <i className="fa-solid fa-cookie-bite"></i>
          </div>
          <div className="cookie-consent__text">
            <p className="cookie-consent__message">
              We use cookies to analyze site traffic and improve your experience.
              You can accept or decline analytics cookies.
            </p>
            <p className="cookie-consent__links">
              Learn more in our <Link to="/privacy#cookies">Privacy Policy</Link>.
            </p>
          </div>
        </div>
        <div className="cookie-consent__actions">
          <button
            className="btn-secondary cookie-consent__btn"
            onClick={() => handleChoice(declineCookies)}
          >
            Decline
          </button>
          <button
            className="btn-primary cookie-consent__btn"
            onClick={() => handleChoice(acceptCookies)}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
