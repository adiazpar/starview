/* Privacy Policy Page
 * Traditional, professional legal document styling.
 * Single-column layout with inline table of contents.
 */

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import './styles.css';

function PrivacyPage() {
  const location = useLocation();

  useSEO({
    title: 'Privacy Policy | Starview',
    description: 'Learn how Starview collects, uses, and protects your data. Our privacy policy covers account information, location data, cookies, and your rights.',
    path: '/privacy',
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
    { id: 'collect', label: 'Information We Collect' },
    { id: 'use', label: 'How We Use Your Information' },
    { id: 'sharing', label: 'Data Sharing' },
    { id: 'third-party', label: 'Third-Party Services' },
    { id: 'retention', label: 'Data Retention' },
    { id: 'rights', label: 'Your Rights' },
    { id: 'cookies', label: 'Cookies' },
    { id: 'age', label: 'Age Requirement' },
    { id: 'contact', label: 'Contact Us' },
  ];

  return (
    <div className="page-wrapper">
      <main className="privacy-page">
        {/* Content */}
        <div className="privacy-content">
          <div className="privacy-content__container">

            {/* Header */}
            <header className="privacy-header animate-fade-in-up">
              <h1 className="privacy-header__title">Privacy Policy</h1>
              <p className="privacy-header__updated">
                <strong>Effective date:</strong> January 4, 2026
              </p>
            </header>

            {/* Introduction */}
            <section className="privacy-section privacy-section--intro animate-fade-in-up animate-delay-1">
              <p>
                At Starview, we take your privacy seriously. Please read this Privacy
                Policy to learn how we treat your personal data. <strong>By using or
                accessing our Services in any manner, you acknowledge that you accept
                the practices and policies outlined below, and you hereby consent that
                we will collect, use and share your information as described in this
                Privacy Policy.</strong>
              </p>
              <p>
                Remember that your use of Starview is at all times subject to
                our <Link to="/terms">Terms of Service</Link>, which incorporates
                this Privacy Policy. Any terms we use in this Policy without defining
                them have the definitions given to them in the Terms of Service.
              </p>
            </section>

            {/* Table of Contents */}
            <section className="privacy-section privacy-section--toc animate-fade-in-up animate-delay-2">
              <h2 className="privacy-toc__title">Table of Contents</h2>
              <ul className="privacy-toc__list">
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

            {/* Information We Collect */}
            <section id="collect" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-database"></i>
                </div>
                <h2 className="privacy-section__title">Information We Collect</h2>
              </div>

              <h3 className="privacy-subsection__title">Account Information</h3>
              <p>When you create an account, we collect:</p>
              <ul className="privacy-list">
                <li><strong>Email address</strong> — for account verification and communications</li>
                <li><strong>Username</strong> — your public display name</li>
                <li><strong>Password</strong> — stored securely using industry-standard hashing</li>
                <li><strong>Profile picture</strong> — optional, uploaded by you</li>
                <li><strong>Bio and location</strong> — optional profile details you choose to share</li>
              </ul>

              <h3 className="privacy-subsection__title">Content You Create</h3>
              <p>When you use our platform, we collect content you voluntarily submit:</p>
              <ul className="privacy-list">
                <li><strong>Stargazing locations</strong> — coordinates, descriptions, and details</li>
                <li><strong>Reviews and ratings</strong> — your assessments of locations</li>
                <li><strong>Comments</strong> — your responses to reviews</li>
                <li><strong>Photos</strong> — images you upload for locations or reviews</li>
                <li><strong>Favorites and check-ins</strong> — locations you save or visit</li>
              </ul>

              <h3 className="privacy-subsection__title">Social Interactions</h3>
              <ul className="privacy-list">
                <li><strong>Follows</strong> — users you choose to follow</li>
                <li><strong>Votes</strong> — upvotes and downvotes on reviews and comments</li>
              </ul>

              <h3 className="privacy-subsection__title">Technical Information</h3>
              <p>We automatically collect certain technical data:</p>
              <ul className="privacy-list">
                <li><strong>IP address</strong> — for security and fraud prevention</li>
                <li><strong>Device information</strong> — browser type, operating system</li>
                <li><strong>Usage data</strong> — pages visited, features used, collected via Google Analytics</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section id="use" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-gears"></i>
                </div>
                <h2 className="privacy-section__title">How We Use Your Information</h2>
              </div>

              <p>We use your information to:</p>
              <ul className="privacy-list privacy-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Provide the service</strong> — display your profile, show your reviews, enable social features</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Improve user experience</strong> — analyze usage patterns, fix bugs, develop new features</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Send transactional emails</strong> — account verification, password resets, important notifications</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Ensure security</strong> — detect fraud, prevent abuse, protect our community</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Analytics and monitoring</strong> — understand how our platform is used and improve performance</span>
                </li>
              </ul>

              <div className="privacy-callout privacy-callout--info">
                <i className="fa-solid fa-circle-info"></i>
                <p>
                  We process your data based on legitimate interests (service operation, security),
                  contract performance (providing the service), and consent (analytics, optional features).
                </p>
              </div>
            </section>

            {/* Data Sharing */}
            <section id="sharing" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon privacy-section__icon--success">
                  <i className="fa-solid fa-share-nodes"></i>
                </div>
                <h2 className="privacy-section__title">Data Sharing</h2>
              </div>

              <div className="privacy-callout privacy-callout--success">
                <i className="fa-solid fa-shield-check"></i>
                <div>
                  <strong>We do not sell your personal data.</strong>
                  <p>
                    Your information is never sold to advertisers, data brokers, or any
                    third parties for marketing purposes.
                  </p>
                </div>
              </div>

              <p>We only share data with:</p>
              <ul className="privacy-list">
                <li><strong>Service providers</strong> — essential partners who help us operate (see Third-Party Services below)</li>
                <li><strong>Legal requirements</strong> — when required by law, court order, or to protect rights and safety</li>
                <li><strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of assets</li>
              </ul>
            </section>

            {/* Third-Party Services */}
            <section id="third-party" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-plug"></i>
                </div>
                <h2 className="privacy-section__title">Third-Party Services</h2>
              </div>

              <p>We use the following third-party services to operate Starview:</p>

              <div className="privacy-services">
                <div className="privacy-service">
                  <div className="privacy-service__header">
                    <span className="privacy-service__name">Mapbox</span>
                    <span className="privacy-service__purpose">Maps & Geocoding</span>
                  </div>
                  <p className="privacy-service__desc">
                    Provides interactive maps and converts location coordinates to addresses.
                  </p>
                  <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="privacy-service__link">
                    View Privacy Policy <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                </div>

                <div className="privacy-service">
                  <div className="privacy-service__header">
                    <span className="privacy-service__name">Cloudflare R2</span>
                    <span className="privacy-service__purpose">Media Storage</span>
                  </div>
                  <p className="privacy-service__desc">
                    Stores uploaded images (profile pictures, location and review photos).
                  </p>
                  <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="privacy-service__link">
                    View Privacy Policy <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                </div>

                <div className="privacy-service">
                  <div className="privacy-service__header">
                    <span className="privacy-service__name">Google OAuth</span>
                    <span className="privacy-service__purpose">Authentication</span>
                  </div>
                  <p className="privacy-service__desc">
                    Optional sign-in method. We only receive your email and basic profile info.
                  </p>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="privacy-service__link">
                    View Privacy Policy <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                </div>

                <div className="privacy-service">
                  <div className="privacy-service__header">
                    <span className="privacy-service__name">Google Analytics</span>
                    <span className="privacy-service__purpose">Usage Analytics</span>
                  </div>
                  <p className="privacy-service__desc">
                    Collects anonymized usage data to help us understand how the platform is used.
                  </p>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="privacy-service__link">
                    View Privacy Policy <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                </div>

                <div className="privacy-service">
                  <div className="privacy-service__header">
                    <span className="privacy-service__name">Amazon SES</span>
                    <span className="privacy-service__purpose">Email Delivery</span>
                  </div>
                  <p className="privacy-service__desc">
                    Sends transactional emails like verification and password reset messages.
                  </p>
                  <a href="https://aws.amazon.com/privacy/" target="_blank" rel="noopener noreferrer" className="privacy-service__link">
                    View Privacy Policy <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                </div>
              </div>
            </section>

            {/* Data Retention */}
            <section id="retention" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-clock"></i>
                </div>
                <h2 className="privacy-section__title">Data Retention</h2>
              </div>

              <p>We retain your data only as long as necessary:</p>
              <ul className="privacy-list">
                <li><strong>Active accounts</strong> — data retained while your account exists</li>
                <li><strong>Account deletion</strong> — all personal data is permanently deleted immediately upon request</li>
                <li><strong>Security logs</strong> — retained for up to 90 days for fraud prevention</li>
              </ul>

              <div className="privacy-callout privacy-callout--info">
                <i className="fa-solid fa-trash-can"></i>
                <p>
                  When you delete your account, we permanently remove your profile, reviews,
                  comments, photos, and all associated personal data. This action cannot be undone.
                </p>
              </div>
            </section>

            {/* Your Rights */}
            <section id="rights" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon privacy-section__icon--accent">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <h2 className="privacy-section__title">Your Rights</h2>
              </div>

              <p>
                Under GDPR, CCPA, and other applicable privacy laws, you have the following rights:
              </p>

              <div className="privacy-rights">
                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-eye"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Access Your Data</h4>
                    <p>Request a copy of all personal data we hold about you.</p>
                  </div>
                </div>

                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-pen-to-square"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Correct Your Data</h4>
                    <p>Update inaccurate or incomplete information via your profile settings.</p>
                  </div>
                </div>

                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-trash-can"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Delete Your Data</h4>
                    <p>Request permanent deletion of your account and all associated data.</p>
                  </div>
                </div>

                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-download"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Data Portability</h4>
                    <p>Receive your data in a structured, machine-readable format.</p>
                  </div>
                </div>

                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-ban"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Opt Out of Analytics</h4>
                    <p>Disable Google Analytics tracking via browser settings or extensions.</p>
                  </div>
                </div>

                <div className="privacy-right">
                  <div className="privacy-right__icon">
                    <i className="fa-solid fa-gavel"></i>
                  </div>
                  <div className="privacy-right__content">
                    <h4>Lodge a Complaint</h4>
                    <p>Contact your local data protection authority if you have concerns.</p>
                  </div>
                </div>
              </div>

              <p className="privacy-section__note">
                To exercise these rights, contact us using the information in the Contact section below.
              </p>
            </section>

            {/* Cookies */}
            <section id="cookies" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-cookie-bite"></i>
                </div>
                <h2 className="privacy-section__title">Cookies</h2>
              </div>

              <p>We use cookies and similar technologies for:</p>

              <div className="privacy-cookies">
                <div className="privacy-cookie">
                  <div className="privacy-cookie__badge privacy-cookie__badge--essential">Essential</div>
                  <div className="privacy-cookie__info">
                    <h4>Session Cookies</h4>
                    <p>Required for authentication and security. These keep you logged in.</p>
                  </div>
                </div>

                <div className="privacy-cookie">
                  <div className="privacy-cookie__badge privacy-cookie__badge--analytics">Analytics</div>
                  <div className="privacy-cookie__info">
                    <h4>Google Analytics Cookies</h4>
                    <p>Help us understand usage patterns. Can be blocked via browser settings.</p>
                  </div>
                </div>

                <div className="privacy-cookie">
                  <div className="privacy-cookie__badge privacy-cookie__badge--functional">Functional</div>
                  <div className="privacy-cookie__info">
                    <h4>Preference Cookies</h4>
                    <p>Remember your theme preference (dark/light mode) and other settings.</p>
                  </div>
                </div>
              </div>

              <p className="privacy-section__note">
                You can manage cookie preferences through your browser settings. Note that
                disabling essential cookies may prevent you from using certain features.
              </p>
            </section>

            {/* Age Requirement */}
            <section id="age" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon">
                  <i className="fa-solid fa-user-check"></i>
                </div>
                <h2 className="privacy-section__title">Age Requirement</h2>
              </div>

              <div className="privacy-callout privacy-callout--warning">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <div>
                  <strong>You must be at least 16 years old to use Starview.</strong>
                  <p>
                    We do not knowingly collect personal information from children under 16.
                    If we become aware that a child under 16 has provided us with personal
                    data, we will take steps to delete such information.
                  </p>
                </div>
              </div>

              <p>
                If you are a parent or guardian and believe your child has provided us with
                personal information, please contact us immediately.
              </p>
            </section>

            {/* Contact */}
            <section id="contact" className="privacy-section glass-card animate-fade-in-up animate-delay-3">
              <div className="privacy-section__header">
                <div className="privacy-section__icon privacy-section__icon--accent">
                  <i className="fa-solid fa-envelope"></i>
                </div>
                <h2 className="privacy-section__title">Contact Us</h2>
              </div>

              <p>
                If you have questions about this Privacy Policy or want to exercise your
                data rights, you can reach us at:
              </p>

              <div className="privacy-contact">
                <a href="mailto:contact@starview.app" className="privacy-contact__email">
                  <i className="fa-solid fa-envelope"></i>
                  <span>contact@starview.app</span>
                </a>
              </div>

              <p>
                We aim to respond to all privacy inquiries within 30 days.
              </p>
            </section>

            {/* Updates */}
            <section className="privacy-section privacy-section--updates animate-fade-in-up animate-delay-3">
              <h3>Policy Updates</h3>
              <p>
                We may update this Privacy Policy from time to time. When we make significant
                changes, we will notify you by posting a notice on our website or sending you
                an email. We encourage you to review this page periodically.
              </p>
              <p className="privacy-section__note">
                Your continued use of Starview after changes to this policy constitutes
                acceptance of the updated terms.
              </p>
            </section>

            {/* Back to top */}
            <div className="privacy-footer animate-fade-in-up animate-delay-3">
              <button
                className="privacy-footer__top"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <i className="fa-solid fa-arrow-up"></i>
                <span>Back to top</span>
              </button>
              <Link to="/" className="privacy-footer__home">
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

export default PrivacyPage;
