/* California Privacy Rights (CCPA) Page
 * Traditional, professional legal document styling.
 * Single-column layout with inline table of contents.
 */

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSEO } from '../../hooks/useSEO';
import './styles.css';

function CCPAPage() {
  const location = useLocation();

  useSEO({
    title: 'California Privacy Rights | Starview',
    description: 'Learn about your California privacy rights under CCPA/CPRA, including the right to know, delete, and opt-out. Starview does not sell your personal information.',
    path: '/ccpa',
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
    { id: 'overview', label: 'Overview' },
    { id: 'no-sale', label: 'We Do Not Sell Your Data' },
    { id: 'rights', label: 'Your California Rights' },
    { id: 'categories', label: 'Information We Collect' },
    { id: 'exercise', label: 'How to Exercise Your Rights' },
    { id: 'verification', label: 'Verification Process' },
    { id: 'contact', label: 'Contact Us' },
  ];

  return (
    <div className="page-wrapper">
      <main className="ccpa-page">
        {/* Content */}
        <div className="ccpa-content">
          <div className="ccpa-content__container">

            {/* Header */}
            <header className="ccpa-header animate-fade-in-up">
              <h1 className="ccpa-header__title">California Privacy Rights</h1>
              <p className="ccpa-header__updated">
                <strong>Last updated:</strong> January 17, 2026
              </p>
            </header>

            {/* Introduction */}
            <section className="ccpa-section ccpa-section--intro animate-fade-in-up animate-delay-1">
              <p>
                This page provides information for California residents about their privacy
                rights under the California Consumer Privacy Act (CCPA) as amended by the
                California Privacy Rights Act (CPRA). This notice supplements
                our <Link to="/privacy">Privacy Policy</Link>.
              </p>
              <p>
                If you are a California resident, you have specific rights regarding your
                personal information. This page explains those rights and how to exercise them.
              </p>
            </section>

            {/* Table of Contents */}
            <section className="ccpa-section ccpa-section--toc animate-fade-in-up animate-delay-2">
              <h2 className="ccpa-toc__title">Table of Contents</h2>
              <ul className="ccpa-toc__list">
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

            {/* Overview */}
            <section id="overview" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon">
                  <i className="fa-solid fa-scale-balanced"></i>
                </div>
                <h2 className="ccpa-section__title">Overview</h2>
              </div>

              <p>
                The California Consumer Privacy Act (CCPA), as amended by the California
                Privacy Rights Act (CPRA), provides California residents with specific
                rights regarding their personal information. These laws require businesses
                to be transparent about their data practices and give consumers control
                over their personal information.
              </p>

              <p>
                Under CCPA/CPRA, "personal information" means information that identifies,
                relates to, describes, is reasonably capable of being associated with, or
                could reasonably be linked, directly or indirectly, with a particular
                consumer or household.
              </p>
            </section>

            {/* We Do Not Sell Your Data */}
            <section id="no-sale" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon ccpa-section__icon--success">
                  <i className="fa-solid fa-shield-check"></i>
                </div>
                <h2 className="ccpa-section__title">We Do Not Sell Your Data</h2>
              </div>

              <div className="ccpa-callout ccpa-callout--success">
                <i className="fa-solid fa-circle-check"></i>
                <div>
                  <strong>Starview does not sell your personal information.</strong>
                  <p>
                    We have not sold personal information in the preceding 12 months and
                    have no plans to do so. We do not sell personal information of minors
                    under 16 years of age.
                  </p>
                </div>
              </div>

              <p>
                Under CCPA/CPRA, "sale" means selling, renting, releasing, disclosing,
                disseminating, making available, transferring, or otherwise communicating
                a consumer's personal information to a third party for monetary or other
                valuable consideration.
              </p>

              <h3 className="ccpa-subsection__title">What About "Sharing"?</h3>
              <p>
                CPRA also regulates "sharing" of personal information for cross-context
                behavioral advertising. Starview does not share your personal information
                for cross-context behavioral advertising purposes. While we use Google
                Analytics for website analytics, this is for our own internal purposes
                and does not constitute "sharing" under CPRA.
              </p>
            </section>

            {/* Your California Rights */}
            <section id="rights" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon ccpa-section__icon--accent">
                  <i className="fa-solid fa-user-shield"></i>
                </div>
                <h2 className="ccpa-section__title">Your California Rights</h2>
              </div>

              <p>
                As a California resident, you have the following rights under CCPA/CPRA:
              </p>

              <div className="ccpa-rights">
                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Know</span>
                  </div>
                  <p className="ccpa-right__desc">
                    You can request that we disclose what personal information we have
                    collected about you, including the categories of information, sources,
                    purposes for collection, and third parties with whom we share it.
                  </p>
                </div>

                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Delete</span>
                  </div>
                  <p className="ccpa-right__desc">
                    You can request that we delete the personal information we have
                    collected from you, subject to certain exceptions (such as completing
                    a transaction or complying with legal obligations).
                  </p>
                </div>

                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Correct</span>
                  </div>
                  <p className="ccpa-right__desc">
                    You can request that we correct inaccurate personal information that
                    we maintain about you.
                  </p>
                </div>

                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Opt-Out of Sale/Sharing</span>
                  </div>
                  <p className="ccpa-right__desc">
                    You can opt-out of the sale or sharing of your personal information.
                    As noted above, Starview does not sell or share your personal information,
                    so this right does not currently apply.
                  </p>
                </div>

                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Limit Use of Sensitive Information</span>
                  </div>
                  <p className="ccpa-right__desc">
                    You can limit the use and disclosure of sensitive personal information.
                    Starview collects minimal sensitive information (such as precise
                    geolocation when you choose to share your location).
                  </p>
                </div>

                <div className="ccpa-right">
                  <div className="ccpa-right__header">
                    <span className="ccpa-right__name">Right to Non-Discrimination</span>
                  </div>
                  <p className="ccpa-right__desc">
                    We will not discriminate against you for exercising any of your CCPA/CPRA
                    rights. We will not deny you services, charge different prices, or provide
                    a different quality of service because you exercised your rights.
                  </p>
                </div>
              </div>
            </section>

            {/* Information We Collect */}
            <section id="categories" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon">
                  <i className="fa-solid fa-database"></i>
                </div>
                <h2 className="ccpa-section__title">Information We Collect</h2>
              </div>

              <p>
                In the preceding 12 months, we have collected the following categories of
                personal information from California residents:
              </p>

              <div className="ccpa-categories">
                <div className="ccpa-category">
                  <div className="ccpa-category__badge">A</div>
                  <div className="ccpa-category__info">
                    <h4>Identifiers</h4>
                    <p>Email address, username, IP address</p>
                  </div>
                </div>

                <div className="ccpa-category">
                  <div className="ccpa-category__badge">B</div>
                  <div className="ccpa-category__info">
                    <h4>Personal Information (Cal. Civ. Code 1798.80(e))</h4>
                    <p>Name (if provided in profile)</p>
                  </div>
                </div>

                <div className="ccpa-category">
                  <div className="ccpa-category__badge">F</div>
                  <div className="ccpa-category__info">
                    <h4>Internet or Network Activity</h4>
                    <p>Browsing history on our site, interactions with our service</p>
                  </div>
                </div>

                <div className="ccpa-category">
                  <div className="ccpa-category__badge">G</div>
                  <div className="ccpa-category__info">
                    <h4>Geolocation Data</h4>
                    <p>Approximate location (city/region), precise location (if you enable location services)</p>
                  </div>
                </div>

                <div className="ccpa-category">
                  <div className="ccpa-category__badge">I</div>
                  <div className="ccpa-category__info">
                    <h4>Professional or Employment Information</h4>
                    <p>Not collected</p>
                  </div>
                </div>

                <div className="ccpa-category">
                  <div className="ccpa-category__badge">K</div>
                  <div className="ccpa-category__info">
                    <h4>Inferences</h4>
                    <p>Preferences based on your activity (favorite locations, viewing patterns)</p>
                  </div>
                </div>
              </div>

              <p className="ccpa-section__note">
                For more details about the specific information we collect and how we use it,
                please see our <Link to="/privacy">Privacy Policy</Link>.
              </p>
            </section>

            {/* How to Exercise Your Rights */}
            <section id="exercise" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon">
                  <i className="fa-solid fa-paper-plane"></i>
                </div>
                <h2 className="ccpa-section__title">How to Exercise Your Rights</h2>
              </div>

              <p>
                To exercise any of your California privacy rights, you may submit a request
                by contacting us:
              </p>

              <div className="ccpa-contact-box">
                <a href="mailto:contact@starview.app" className="ccpa-contact-box__email">
                  <i className="fa-solid fa-envelope"></i>
                  contact@starview.app
                </a>
              </div>

              <p>When submitting a request, please include:</p>
              <ul className="ccpa-list">
                <li><strong>Your name</strong> and email address associated with your Starview account</li>
                <li><strong>The specific right</strong> you wish to exercise (know, delete, correct, etc.)</li>
                <li><strong>A description</strong> of your request in sufficient detail</li>
              </ul>

              <h3 className="ccpa-subsection__title">Authorized Agents</h3>
              <p>
                You may designate an authorized agent to submit requests on your behalf.
                The agent must provide proof of authorization (such as a power of attorney
                or written permission signed by you). We may also require you to verify
                your identity directly with us.
              </p>

              <h3 className="ccpa-subsection__title">Response Time</h3>
              <p>
                We will respond to verifiable consumer requests within 45 days of receipt.
                If we need more time (up to an additional 45 days), we will notify you of
                the reason and extension period in writing.
              </p>
            </section>

            {/* Verification Process */}
            <section id="verification" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon">
                  <i className="fa-solid fa-fingerprint"></i>
                </div>
                <h2 className="ccpa-section__title">Verification Process</h2>
              </div>

              <p>
                To protect your privacy and security, we must verify your identity before
                responding to your request. Our verification process typically includes:
              </p>

              <ul className="ccpa-list ccpa-list--icons">
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Email verification</strong> — We will send a confirmation email to the address on your account</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Account matching</strong> — We will match your request to information we have on file</span>
                </li>
                <li>
                  <i className="fa-solid fa-check"></i>
                  <span><strong>Additional verification</strong> — For sensitive requests, we may ask for additional information</span>
                </li>
              </ul>

              <div className="ccpa-callout ccpa-callout--info">
                <i className="fa-solid fa-circle-info"></i>
                <p>
                  If we cannot verify your identity, we may not be able to fulfill your
                  request. We will notify you if this is the case.
                </p>
              </div>
            </section>

            {/* Contact */}
            <section id="contact" className="ccpa-section glass-card animate-fade-in-up animate-delay-3">
              <div className="ccpa-section__header">
                <div className="ccpa-section__icon ccpa-section__icon--accent">
                  <i className="fa-solid fa-envelope"></i>
                </div>
                <h2 className="ccpa-section__title">Contact Us</h2>
              </div>

              <p>
                If you have questions about your California privacy rights or this notice,
                please contact us:
              </p>

              <div className="ccpa-contact">
                <a href="mailto:contact@starview.app" className="ccpa-contact__email">
                  <i className="fa-solid fa-envelope"></i>
                  <span>contact@starview.app</span>
                </a>
              </div>

              <p>
                You may also review our full <Link to="/privacy">Privacy Policy</Link> for
                more information about our data practices.
              </p>
            </section>

            {/* Updates */}
            <section className="ccpa-section ccpa-section--updates animate-fade-in-up animate-delay-3">
              <h3>Changes to This Notice</h3>
              <p>
                We may update this California Privacy Notice from time to time. When we make
                changes, we will update the "Last updated" date at the top of this page.
                We encourage you to review this notice periodically.
              </p>
            </section>

            {/* Back to top */}
            <div className="ccpa-footer animate-fade-in-up animate-delay-3">
              <button
                className="ccpa-footer__top"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <i className="fa-solid fa-arrow-up"></i>
                <span>Back to top</span>
              </button>
              <Link to="/" className="ccpa-footer__home">
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

export default CCPAPage;
