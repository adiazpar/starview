/* Terms of Service Page
 * Legal terms with observatory-themed design.
 * Sections use glass cards with smooth scroll navigation.
 */

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import './styles.css';

function TermsPage() {
  const location = useLocation();

  useSEO({
    title: 'Terms of Service | Starview',
    description: 'Read Starview\'s Terms of Service covering eligibility, content licensing, acceptable use policies, and DMCA procedures for our stargazing community.',
    path: '/terms',
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
    { id: 'eligibility', label: 'Eligibility', icon: 'fa-user-check' },
    { id: 'account', label: 'Your Account', icon: 'fa-user-gear' },
    { id: 'content', label: 'Your Content', icon: 'fa-pen-fancy' },
    { id: 'acceptable-use', label: 'Acceptable Use', icon: 'fa-check-double' },
    { id: 'licensing', label: 'Content Licensing', icon: 'fa-scale-balanced' },
    { id: 'moderation', label: 'Moderation', icon: 'fa-shield-halved' },
    { id: 'dmca', label: 'Copyright', icon: 'fa-copyright' },
    { id: 'disclaimers', label: 'Disclaimers', icon: 'fa-triangle-exclamation' },
    { id: 'liability', label: 'Liability', icon: 'fa-gavel' },
    { id: 'disputes', label: 'Disputes', icon: 'fa-handshake' },
    { id: 'contact', label: 'Contact', icon: 'fa-envelope' },
  ];

  return (
    <div className="page-wrapper">
      <main className="terms-page">
        {/* Header */}
        <header className="terms-header">
          <div className="terms-header__container">
            <div className="terms-header__badge">
              <i className="fa-solid fa-file-contract"></i>
              <span>Terms of Service</span>
            </div>
            <h1 className="terms-header__title">
              Terms of Service
            </h1>
            <p className="terms-header__subtitle">
              Please read these terms carefully before using Starview.
              By accessing or using our service, you agree to be bound by these terms.
            </p>
            <p className="terms-header__updated">
              <i className="fa-regular fa-calendar"></i>
              Last updated: January 4, 2026
            </p>
          </div>
        </header>

        {/* Navigation */}
        <nav className="terms-nav" aria-label="Terms of service sections">
          <div className="terms-nav__container">
            <div className="terms-nav__scroll">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="terms-nav__link"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(section.id)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }}
                >
                  <i className={`fa-solid ${section.icon}`}></i>
                  <span>{section.label}</span>
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* Content */}
        <div className="terms-content">
          <div className="terms-content__container">

            {/* Introduction */}
            <section className="terms-section terms-section--intro">
              <p>
                Welcome to Starview, a stargazing location review platform that helps astronomers
                discover and share the best spots for observing the night sky. These Terms of
                Service ("Terms") govern your access to and use of our website, services, and
                applications (collectively, the "Service").
              </p>
              <p>
                By creating an account or using Starview, you agree to these Terms. If you do
                not agree to these Terms, you may not use the Service. We may update these
                Terms from time to time, and your continued use constitutes acceptance of any
                changes.
              </p>
            </section>

            {/* Eligibility */}
            <section id="eligibility" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-user-check"></i>
                </div>
                <h2 className="terms-section__title">Eligibility</h2>
              </div>

              <div className="terms-callout terms-callout--warning">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <div>
                  <strong>You must be at least 16 years old to use Starview.</strong>
                  <p>
                    By using the Service, you represent and warrant that you are at least
                    16 years of age and have the legal capacity to enter into these Terms.
                  </p>
                </div>
              </div>

              <p>
                If you are using Starview on behalf of an organization, you represent that
                you have the authority to bind that organization to these Terms.
              </p>
            </section>

            {/* Account Responsibilities */}
            <section id="account" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-user-gear"></i>
                </div>
                <h2 className="terms-section__title">Your Account</h2>
              </div>

              <p>When you create an account, you agree to:</p>
              <ul className="terms-list terms-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Provide accurate information</strong> — Your registration details must be truthful and complete</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Maintain security</strong> — Keep your password confidential and secure</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Accept responsibility</strong> — You are responsible for all activity under your account</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Notify us of breaches</strong> — Immediately report any unauthorized access to your account</span>
                </li>
              </ul>

              <div className="terms-callout terms-callout--info">
                <i className="fa-solid fa-circle-info"></i>
                <p>
                  You may not share your account credentials or allow others to access your
                  account. We reserve the right to suspend accounts that show signs of
                  unauthorized access or suspicious activity.
                </p>
              </div>
            </section>

            {/* User-Generated Content */}
            <section id="content" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-pen-fancy"></i>
                </div>
                <h2 className="terms-section__title">Your Content</h2>
              </div>

              <p>
                Starview allows you to submit, post, and share content including stargazing
                locations, reviews, photos, and comments ("User Content"). You retain ownership
                of your User Content, but grant us certain rights to use it.
              </p>

              <h3 className="terms-subsection__title">Content License to Starview</h3>
              <p>
                By submitting User Content, you grant Starview a worldwide, non-exclusive,
                royalty-free, sublicensable, and transferable license to:
              </p>
              <ul className="terms-list">
                <li>Use, reproduce, modify, and display your content on the Service</li>
                <li>Distribute your content to other users of the platform</li>
                <li>Create derivative works (such as thumbnails or excerpts)</li>
                <li>Use your content for promotional purposes</li>
              </ul>

              <h3 className="terms-subsection__title">Your Representations</h3>
              <p>By posting User Content, you represent and warrant that:</p>
              <ul className="terms-list">
                <li>You own the content or have the right to post it</li>
                <li>Your content does not infringe any third-party rights</li>
                <li>Your content complies with these Terms and applicable laws</li>
                <li>Location coordinates and information are accurate to the best of your knowledge</li>
              </ul>

              <div className="terms-callout terms-callout--info">
                <i className="fa-solid fa-circle-info"></i>
                <p>
                  We may remove any User Content at our sole discretion, without notice,
                  for any reason including violation of these Terms.
                </p>
              </div>
            </section>

            {/* Acceptable Use */}
            <section id="acceptable-use" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon terms-section__icon--error">
                  <i className="fa-solid fa-check-double"></i>
                </div>
                <h2 className="terms-section__title">Acceptable Use</h2>
              </div>

              <p>You agree NOT to use Starview to:</p>

              <div className="terms-prohibited">
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Post illegal, harmful, or objectionable content</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Harass, threaten, or intimidate other users</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Post hate speech or discriminatory content</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Spam, advertise, or post misleading information</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Impersonate others or misrepresent your identity</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Infringe copyrights, trademarks, or other IP rights</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Upload malware, viruses, or malicious code</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Attempt to exploit security vulnerabilities</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Scrape or harvest data without permission</span>
                </div>
                <div className="terms-prohibited__item">
                  <i className="fa-solid fa-xmark"></i>
                  <span>Interfere with the Service's operation</span>
                </div>
              </div>
            </section>

            {/* Content Licensing to Others */}
            <section id="licensing" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-scale-balanced"></i>
                </div>
                <h2 className="terms-section__title">Content Licensing</h2>
              </div>

              <p>
                Content on Starview, including User Content, is available under the
                following terms:
              </p>

              <div className="terms-licensing">
                <div className="terms-license">
                  <div className="terms-license__badge terms-license__badge--personal">
                    <i className="fa-solid fa-user"></i>
                    Personal Use
                  </div>
                  <p>
                    You may view, share, and use content for personal, non-commercial purposes
                    without restriction.
                  </p>
                </div>

                <div className="terms-license">
                  <div className="terms-license__badge terms-license__badge--commercial">
                    <i className="fa-solid fa-building"></i>
                    Commercial Use
                  </div>
                  <p>
                    Commercial use of content is permitted <strong>with attribution</strong> to
                    Starview. Please credit "Starview (starview.app)" when using our content
                    commercially.
                  </p>
                </div>

                <div className="terms-license">
                  <div className="terms-license__badge terms-license__badge--restricted">
                    <i className="fa-solid fa-ban"></i>
                    Prohibited
                  </div>
                  <p>
                    Reselling Starview data, bulk downloading for redistribution, or creating
                    competing services using our content is prohibited.
                  </p>
                </div>
              </div>
            </section>

            {/* Content Moderation */}
            <section id="moderation" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <h2 className="terms-section__title">Content Moderation</h2>
              </div>

              <p>
                To maintain a safe and welcoming community, Starview reserves the right to:
              </p>

              <ul className="terms-list terms-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Remove content</strong> — Delete any content that violates these Terms or is otherwise objectionable</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Suspend accounts</strong> — Temporarily restrict access for Terms violations</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Terminate accounts</strong> — Permanently ban users for serious or repeated violations</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Report to authorities</strong> — Disclose information to law enforcement when required</span>
                </li>
              </ul>

              <div className="terms-callout terms-callout--info">
                <i className="fa-solid fa-flag"></i>
                <p>
                  If you encounter content that violates these Terms, please use the report
                  feature or contact us. We review all reports and take appropriate action.
                </p>
              </div>
            </section>

            {/* DMCA / Copyright */}
            <section id="dmca" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-copyright"></i>
                </div>
                <h2 className="terms-section__title">Copyright &amp; DMCA</h2>
              </div>

              <p>
                Starview respects intellectual property rights and expects users to do the same.
                We respond to valid copyright infringement notices under the Digital Millennium
                Copyright Act (DMCA).
              </p>

              <h3 className="terms-subsection__title">Filing a DMCA Notice</h3>
              <p>
                If you believe your copyrighted work has been infringed on Starview, please
                send a notice to our designated agent containing:
              </p>
              <ul className="terms-list">
                <li>Identification of the copyrighted work</li>
                <li>Identification of the infringing material and its location</li>
                <li>Your contact information</li>
                <li>A statement of good faith belief that the use is unauthorized</li>
                <li>A statement under penalty of perjury that the information is accurate</li>
                <li>Your physical or electronic signature</li>
              </ul>

              <div className="terms-contact-box">
                <span className="terms-contact-box__label">DMCA Agent</span>
                <a href="mailto:contact@starview.app" className="terms-contact-box__email">
                  <i className="fa-solid fa-envelope"></i>
                  contact@starview.app
                </a>
              </div>

              <p className="terms-section__note">
                We may terminate accounts of repeat infringers.
              </p>
            </section>

            {/* Third-Party Services */}
            <section className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-plug"></i>
                </div>
                <h2 className="terms-section__title">Third-Party Services</h2>
              </div>

              <p>
                Starview uses third-party services to provide functionality:
              </p>
              <ul className="terms-list">
                <li><strong>Mapbox</strong> — Maps and geocoding</li>
                <li><strong>Cloudflare</strong> — Content delivery and media storage</li>
                <li><strong>Google</strong> — OAuth authentication and analytics</li>
                <li><strong>Amazon Web Services</strong> — Email delivery</li>
              </ul>

              <p>
                Your use of these services is subject to their respective terms and privacy
                policies. Links to third-party websites are provided for convenience only
                and do not imply endorsement.
              </p>
            </section>

            {/* Disclaimers */}
            <section id="disclaimers" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon terms-section__icon--warning">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h2 className="terms-section__title">Disclaimers</h2>
              </div>

              <div className="terms-callout terms-callout--warning">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <div>
                  <strong>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.</strong>
                  <p>
                    Starview disclaims all warranties, express or implied, including warranties
                    of merchantability, fitness for a particular purpose, and non-infringement.
                  </p>
                </div>
              </div>

              <h3 className="terms-subsection__title">Location Information</h3>
              <p>
                Stargazing locations on Starview are user-submitted. We do not verify the
                accuracy, safety, or accessibility of any location. Before visiting any
                location:
              </p>
              <ul className="terms-list">
                <li>Verify coordinates and directions independently</li>
                <li>Check that you have legal access to the area</li>
                <li>Research current conditions and potential hazards</li>
                <li>Take appropriate safety precautions</li>
              </ul>

              <div className="terms-callout terms-callout--error">
                <i className="fa-solid fa-moon"></i>
                <div>
                  <strong>Stargazing Safety Warning</strong>
                  <p>
                    Stargazing often involves visiting dark, remote locations at night. This
                    carries inherent risks. You are solely responsible for your safety. Starview
                    is not liable for any injuries, accidents, or incidents at any location.
                  </p>
                </div>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section id="liability" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon">
                  <i className="fa-solid fa-gavel"></i>
                </div>
                <h2 className="terms-section__title">Limitation of Liability</h2>
              </div>

              <p>
                To the maximum extent permitted by law:
              </p>

              <ul className="terms-list">
                <li>
                  Starview shall not be liable for any <strong>indirect, incidental, special,
                  consequential, or punitive damages</strong>, including loss of profits, data,
                  or goodwill.
                </li>
                <li>
                  Our total liability for any claims arising from your use of the Service is
                  limited to the <strong>amount you paid to Starview</strong> in the 12 months
                  preceding the claim (which is $0 for our free service).
                </li>
                <li>
                  We are not liable for any User Content posted by others or for any actions
                  you take based on information found on the Service.
                </li>
              </ul>

              <h3 className="terms-subsection__title">Indemnification</h3>
              <p>
                You agree to indemnify, defend, and hold harmless Starview, its officers,
                directors, employees, and agents from any claims, damages, losses, or expenses
                (including legal fees) arising from:
              </p>
              <ul className="terms-list">
                <li>Your use of the Service</li>
                <li>Your User Content</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
              </ul>
            </section>

            {/* Dispute Resolution */}
            <section id="disputes" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon terms-section__icon--accent">
                  <i className="fa-solid fa-handshake"></i>
                </div>
                <h2 className="terms-section__title">Dispute Resolution</h2>
              </div>

              <h3 className="terms-subsection__title">Binding Arbitration</h3>
              <p>
                Any dispute arising from these Terms or your use of Starview shall be resolved
                through <strong>binding arbitration</strong> rather than in court, except that
                you may assert claims in small claims court if they qualify.
              </p>

              <h3 className="terms-subsection__title">Class Action Waiver</h3>
              <div className="terms-callout terms-callout--info">
                <i className="fa-solid fa-users-slash"></i>
                <p>
                  You agree to resolve disputes with Starview on an individual basis only.
                  You waive any right to participate in class actions, class arbitrations,
                  or representative proceedings.
                </p>
              </div>

              <h3 className="terms-subsection__title">Governing Law</h3>
              <p>
                These Terms are governed by the laws of the <strong>State of California,
                United States</strong>, without regard to conflict of law principles. Any
                arbitration will take place in California.
              </p>
            </section>

            {/* Contact */}
            <section id="contact" className="terms-section glass-card">
              <div className="terms-section__header">
                <div className="terms-section__icon terms-section__icon--accent">
                  <i className="fa-solid fa-envelope"></i>
                </div>
                <h2 className="terms-section__title">Contact Us</h2>
              </div>

              <p>
                If you have questions about these Terms of Service, please contact us:
              </p>

              <div className="terms-contact">
                <a href="mailto:contact@starview.app" className="terms-contact__email">
                  <i className="fa-solid fa-envelope"></i>
                  <span>contact@starview.app</span>
                </a>
              </div>
            </section>

            {/* Updates */}
            <section className="terms-section terms-section--updates">
              <h3>Changes to Terms</h3>
              <p>
                We may modify these Terms at any time. When we make material changes, we will
                notify you by posting a notice on the Service or sending you an email. Your
                continued use of Starview after changes constitutes acceptance of the new Terms.
              </p>
              <p className="terms-section__note">
                We encourage you to review these Terms periodically to stay informed of updates.
              </p>
            </section>

            {/* Back to top */}
            <div className="terms-footer">
              <button
                className="terms-footer__top"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <i className="fa-solid fa-arrow-up"></i>
                <span>Back to top</span>
              </button>
              <Link to="/" className="terms-footer__home">
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

export default TermsPage;
