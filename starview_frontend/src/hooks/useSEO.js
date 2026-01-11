/* useSEO Hook
 * Manages page-specific meta tags for SEO.
 * Works with React 19 without external dependencies.
 */

import { useEffect } from 'react';

const DEFAULT_TITLE = 'Starview - Stargazing Location Reviews';
const DEFAULT_DESCRIPTION = 'Discover and share exceptional stargazing locations';
const SITE_URL = 'https://www.starview.app';

/**
 * Updates document head with page-specific SEO meta tags.
 * Automatically restores defaults on unmount.
 *
 * @param {Object} options
 * @param {string} options.title - Page title (appends " | Starview" if not homepage)
 * @param {string} options.description - Meta description (max 160 chars recommended)
 * @param {string} [options.path] - URL path for canonical (e.g., "/terms")
 * @param {string} [options.type] - Open Graph type (default: "website")
 */
export function useSEO({ title, description, path = '', type = 'website' }) {
  useEffect(() => {
    // Store original values for cleanup
    const originalTitle = document.title;

    // Set document title
    document.title = title;

    // Helper to update or create meta tag
    const setMeta = (selector, content, attr = 'content') => {
      let element = document.querySelector(selector);
      if (element) {
        element.setAttribute(attr, content);
      }
    };

    // Update meta description
    setMeta('meta[name="description"]', description);

    // Update Open Graph tags
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', `${SITE_URL}${path}`);
    setMeta('meta[property="og:type"]', type);

    // Update Twitter Card tags
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:url"]', `${SITE_URL}${path}`);

    // Add or update canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${SITE_URL}${path}`);

    // Cleanup: restore defaults on unmount
    return () => {
      document.title = originalTitle;
      setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
      setMeta('meta[property="og:title"]', DEFAULT_TITLE);
      setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
      setMeta('meta[property="og:url"]', `${SITE_URL}/`);
      setMeta('meta[property="og:type"]', 'website');
      setMeta('meta[name="twitter:title"]', DEFAULT_TITLE);
      setMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
      setMeta('meta[name="twitter:url"]', `${SITE_URL}/`);

      // Remove canonical if we added it
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink) {
        canonicalLink.setAttribute('href', `${SITE_URL}/`);
      }
    };
  }, [title, description, path, type]);
}

export default useSEO;
