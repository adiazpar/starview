/**
 * Security utilities for frontend protection.
 *
 * Prevents open redirect vulnerabilities by validating redirect URLs
 * before navigation. Only allows same-origin URLs or relative paths.
 */

/**
 * Validates that a URL is safe for redirection.
 * Prevents open redirect attacks by only allowing:
 * - Relative URLs starting with / (but not //)
 * - Same-origin absolute URLs
 *
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if the URL is safe for redirection
 */
export function isValidRedirect(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Block empty strings
  if (!trimmedUrl) {
    return false;
  }

  // Block protocol-relative URLs (//example.com)
  if (trimmedUrl.startsWith('//')) {
    return false;
  }

  // Allow relative URLs starting with /
  if (trimmedUrl.startsWith('/')) {
    return true;
  }

  // Check if it's a same-origin absolute URL
  try {
    const parsed = new URL(trimmedUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Safely redirects to a URL after validation.
 * Falls back to a safe default if the URL is invalid.
 *
 * @param {string} url - The URL to redirect to
 * @param {string} fallback - Fallback URL if validation fails (default: '/')
 */
export function safeRedirect(url, fallback = '/') {
  const targetUrl = isValidRedirect(url) ? url : fallback;
  window.location.href = targetUrl;
}
