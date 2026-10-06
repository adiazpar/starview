/**
 * useCooldown Hook
 *
 * Seconds left before a code can be sent again. Ticks once a second like the
 * VerifyEmail resend countdown; the server still enforces the real limit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * @returns {[number, function(number=): void]} Seconds remaining and a starter
 *   (defaults to 60 seconds; pass 0 to clear).
 */
export function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    const timer = setTimeout(update, 1000);
    // Background tabs can suspend timers. Returning to the page must not impose
    // an extra wait after the real cooldown has already expired.
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [remaining]);

  const start = useCallback((seconds = RESEND_COOLDOWN_SECONDS) => {
    const duration = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
    deadline.current = Date.now() + duration * 1000;
    setRemaining(duration);
  }, []);

  return [remaining, start];
}

/** Seconds a throttled (429) response asks the caller to wait, or 0 if it gave none. */
export function retryAfterSeconds(error) {
  const wait = Number(error?.response?.data?.retry_after);
  return wait > 0 ? Math.ceil(wait) : 0;
}

export default useCooldown;
