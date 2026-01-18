/* Accessibility Statement Page
 * Traditional, professional legal document styling.
 * Single-column layout with inline table of contents.
 */

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import './styles.css';

function AccessibilityPage() {
  const location = useLocation();

  useSEO({
    title: 'Accessibility Statement | Starview',
    description: 'Learn about Starview\'s commitment to digital accessibility, our WCAG 2.1 conformance goals, and how to report accessibility issues.',
    path: '/accessibility',
  });

  // Scroll to section if hash is present
  useEffect(() => {
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [location.hash]);

  const sections = [
    { id: 'commitment', label: 'Our Commitment' },
    { id: 'conformance', label: 'Conformance Status' },
    { id: 'features', label: 'Accessibility Features' },
    { id: 'limitations', label: 'Known Limitations' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'compatibility', label: 'Compatibility' },
  ];

  return (
    <div className="page-wrapper">
      <main className="a11y-page">
        {/* Content */}
        <div className="a11y-content">
          <div className="a11y-content__container">

            {/* Header */}
            <header className="a11y-header animate-fade-in-up">
              <h1 className="a11y-header__title">Accessibility Statement</h1>
              <p className="a11y-header__updated">
                <strong>Last updated:</strong> January 17, 2026
              </p>
            </header>

            {/* Introduction */}
            <section className="a11y-section a11y-section--intro animate-fade-in-up animate-delay-1">
              <p>
                Starview is committed to ensuring digital accessibility for people with
                disabilities. We are continually improving the user experience for everyone
                and applying the relevant accessibility standards to guarantee we provide
                equal access to all users.
              </p>
              <p>
                This statement applies to the Starview website at{' '}
                <a href="https://starview.app" target="_blank" rel="noopener noreferrer">
                  starview.app
                </a>.
              </p>
            </section>

            {/* Table of Contents */}
            <section className="a11y-section a11y-section--toc animate-fade-in-up animate-delay-2">
              <h2 className="a11y-toc__title">Table of Contents</h2>
              <ul className="a11y-toc__list">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(section.id)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start'
                        });
                      }}
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {/* Our Commitment */}
            <section id="commitment" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon">
                  <i className="fa-solid fa-heart"></i>
                </div>
                <h2 className="a11y-section__title">Our Commitment</h2>
              </div>

              <p>
                We believe the night sky belongs to everyone. Starview strives to create
                an inclusive experience that enables all people—regardless of ability—to
                discover and share stargazing locations.
              </p>

              <div className="a11y-callout a11y-callout--info">
                <i className="fa-solid fa-universal-access"></i>
                <div>
                  <strong>Accessibility is an ongoing effort.</strong>
                  <p>
                    We regularly review our website against accessibility guidelines and
                    make improvements based on user feedback and evolving best practices.
                  </p>
                </div>
              </div>
            </section>

            {/* Conformance Status */}
            <section id="conformance" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon">
                  <i className="fa-solid fa-check-double"></i>
                </div>
                <h2 className="a11y-section__title">Conformance Status</h2>
              </div>

              <p>
                We aim to conform to the{' '}
                <a
                  href="https://www.w3.org/WAI/WCAG21/quickref/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Web Content Accessibility Guidelines (WCAG) 2.1 Level AA
                </a>
                . These guidelines explain how to make web content more accessible to
                people with a wide range of disabilities.
              </p>

              <div className="a11y-conformance">
                <div className="a11y-conformance__item">
                  <div className="a11y-conformance__badge a11y-conformance__badge--target">
                    <i className="fa-solid fa-bullseye"></i>
                    Target
                  </div>
                  <div className="a11y-conformance__info">
                    <h4>WCAG 2.1 Level AA</h4>
                    <p>Our target conformance level for the entire website.</p>
                  </div>
                </div>

                <div className="a11y-conformance__item">
                  <div className="a11y-conformance__badge a11y-conformance__badge--status">
                    <i className="fa-solid fa-spinner"></i>
                    In Progress
                  </div>
                  <div className="a11y-conformance__info">
                    <h4>Current Status</h4>
                    <p>We are actively working toward full conformance.</p>
                  </div>
                </div>
              </div>

              <p className="a11y-section__note">
                Conformance status is based on self-evaluation. We welcome third-party
                audits and user feedback to help us improve.
              </p>
            </section>

            {/* Accessibility Features */}
            <section id="features" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon a11y-section__icon--success">
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                </div>
                <h2 className="a11y-section__title">Accessibility Features</h2>
              </div>

              <p>Starview includes the following accessibility features:</p>

              <h3 className="a11y-subsection__title">Navigation & Structure</h3>
              <ul className="a11y-list a11y-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Semantic HTML</strong> — Proper heading hierarchy and landmark regions</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Keyboard navigation</strong> — All interactive elements are keyboard accessible</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Skip links</strong> — Skip to main content functionality</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Focus indicators</strong> — Visible focus states on all interactive elements</span>
                </li>
              </ul>

              <h3 className="a11y-subsection__title">Visual Design</h3>
              <ul className="a11y-list a11y-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Color contrast</strong> — Text meets WCAG AA contrast requirements</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Dark/Light modes</strong> — Theme options to reduce eye strain</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Resizable text</strong> — Content remains usable at 200% zoom</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>No color-only information</strong> — Icons and text supplement color cues</span>
                </li>
              </ul>

              <h3 className="a11y-subsection__title">Assistive Technology</h3>
              <ul className="a11y-list a11y-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Screen reader support</strong> — ARIA labels and descriptions where needed</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Alt text</strong> — Descriptive text for meaningful images</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Form labels</strong> — All form inputs have associated labels</span>
                </li>
              </ul>

              <h3 className="a11y-subsection__title">Motion & Animation</h3>
              <ul className="a11y-list a11y-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Reduced motion</strong> — Respects prefers-reduced-motion preference</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>No auto-playing media</strong> — Users control when media plays</span>
                </li>
              </ul>
            </section>

            {/* Known Limitations */}
            <section id="limitations" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon a11y-section__icon--warning">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h2 className="a11y-section__title">Known Limitations</h2>
              </div>

              <p>
                Despite our best efforts, some areas of Starview may have accessibility
                limitations. We are actively working to address these issues:
              </p>

              <div className="a11y-limitations">
                <div className="a11y-limitation">
                  <div className="a11y-limitation__header">
                    <span className="a11y-limitation__name">Interactive Maps</span>
                  </div>
                  <p className="a11y-limitation__desc">
                    Our Mapbox-powered maps have limited keyboard and screen reader support.
                    We provide text-based location information as an alternative.
                  </p>
                </div>

                <div className="a11y-limitation">
                  <div className="a11y-limitation__header">
                    <span className="a11y-limitation__name">User-Uploaded Images</span>
                  </div>
                  <p className="a11y-limitation__desc">
                    Images uploaded by users may lack descriptive alt text. We encourage
                    contributors to provide descriptions when uploading photos.
                  </p>
                </div>

                <div className="a11y-limitation">
                  <div className="a11y-limitation__header">
                    <span className="a11y-limitation__name">Third-Party Content</span>
                  </div>
                  <p className="a11y-limitation__desc">
                    Some embedded third-party widgets may not meet our accessibility standards.
                    We work with vendors to improve accessibility where possible.
                  </p>
                </div>
              </div>
            </section>

            {/* Feedback */}
            <section id="feedback" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon a11y-section__icon--accent">
                  <i className="fa-solid fa-comments"></i>
                </div>
                <h2 className="a11y-section__title">Feedback</h2>
              </div>

              <p>
                We welcome your feedback on the accessibility of Starview. Please let us
                know if you encounter accessibility barriers or have suggestions for
                improvement:
              </p>

              <div className="a11y-contact">
                <a href="mailto:contact@starview.app" className="a11y-contact__email">
                  <i className="fa-solid fa-envelope"></i>
                  <span>contact@starview.app</span>
                </a>
              </div>

              <p>When reporting an accessibility issue, please include:</p>
              <ul className="a11y-list">
                <li><strong>Page URL</strong> — The web address where you encountered the issue</li>
                <li><strong>Description</strong> — What you were trying to do and what happened</li>
                <li><strong>Assistive technology</strong> — Screen reader, browser, or device used (if applicable)</li>
              </ul>

              <div className="a11y-callout a11y-callout--info">
                <i className="fa-solid fa-clock"></i>
                <p>
                  We aim to respond to accessibility feedback within 5 business days and
                  resolve issues as quickly as possible.
                </p>
              </div>
            </section>

            {/* Compatibility */}
            <section id="compatibility" className="a11y-section glass-card animate-fade-in-up animate-delay-3">
              <div className="a11y-section__header">
                <div className="a11y-section__icon">
                  <i className="fa-solid fa-laptop"></i>
                </div>
                <h2 className="a11y-section__title">Compatibility</h2>
              </div>

              <p>
                Starview is designed to be compatible with the following assistive
                technologies:
              </p>

              <ul className="a11y-list">
                <li><strong>Screen readers</strong> — VoiceOver (macOS/iOS), NVDA, JAWS</li>
                <li><strong>Voice control</strong> — Voice Control (macOS/iOS), Dragon NaturallySpeaking</li>
                <li><strong>Keyboard-only navigation</strong> — Full site navigation without a mouse</li>
                <li><strong>Screen magnification</strong> — ZoomText, built-in OS magnifiers</li>
              </ul>

              <h3 className="a11y-subsection__title">Supported Browsers</h3>
              <p>
                For the best accessibility experience, we recommend using the latest
                versions of:
              </p>
              <ul className="a11y-list">
                <li>Google Chrome</li>
                <li>Mozilla Firefox</li>
                <li>Apple Safari</li>
                <li>Microsoft Edge</li>
              </ul>
            </section>

            {/* Additional Resources */}
            <section className="a11y-section a11y-section--updates animate-fade-in-up animate-delay-3">
              <h3>Additional Resources</h3>
              <p>
                To learn more about web accessibility and your rights, visit these resources:
              </p>
              <ul className="a11y-list">
                <li>
                  <a href="https://www.w3.org/WAI/" target="_blank" rel="noopener noreferrer">
                    W3C Web Accessibility Initiative (WAI)
                  </a>
                </li>
                <li>
                  <a href="https://www.ada.gov/" target="_blank" rel="noopener noreferrer">
                    ADA.gov — Americans with Disabilities Act
                  </a>
                </li>
                <li>
                  <a href="https://webaim.org/" target="_blank" rel="noopener noreferrer">
                    WebAIM — Web Accessibility In Mind
                  </a>
                </li>
              </ul>
            </section>

            {/* Back to top */}
            <div className="a11y-footer animate-fade-in-up animate-delay-3">
              <button
                className="a11y-footer__top"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <i className="fa-solid fa-arrow-up"></i>
                <span>Back to top</span>
              </button>
              <Link to="/" className="a11y-footer__home">
                <i className="fa-solid fa-house"></i>
                <span>Return to Starview</span>
              </Link>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default AccessibilityPage;
