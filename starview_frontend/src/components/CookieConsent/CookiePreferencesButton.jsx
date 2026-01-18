/* Cookie Preferences Button
 * Simple button to reset cookie consent and show the banner again.
 * Used in the Footer to allow users to change their preferences.
 */

import { useCookieConsent } from '../../contexts/CookieConsentContext';

export default function CookiePreferencesButton({ className }) {
  const { resetConsent } = useCookieConsent();

  return (
    <button
      type="button"
      className={className}
      onClick={resetConsent}
    >
      Cookies
    </button>
  );
}
