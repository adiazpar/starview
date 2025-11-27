import { Link, useSearchParams, Navigate } from 'react-router-dom';
import './styles.css';

function EmailVerifiedPage() {
  const [searchParams] = useSearchParams();
  const successToken = searchParams.get('success');

  // If no success token, redirect to login
  // This prevents unauthorized access to the success page
  if (!successToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="email-verified-container">
      <div className="email-verified-content">
        <div className="email-verified-card">
        {/* Success Icon */}
        <div className="email-verified-icon">
          <i className="fa-solid fa-circle-check"></i>
        </div>

        {/* Title */}
        <h1 className="email-verified-title">Email verified!</h1>

        {/* Message */}
        <p className="email-verified-message">
          Your email address has been successfully verified. You can now log in to your Starview account and start exploring the best stargazing locations.
        </p>

        {/* Actions */}
        <div className="email-verified-actions">
          <Link to="/login" className="btn-primary btn-primary--full">
            Go to login
          </Link>
        </div>

        {/* Alternative Action */}
        <p className="email-verified-close-text">
          You may also close this window and return to the login page.
        </p>
      </div>
      </div>
    </div>
  );
}

export default EmailVerifiedPage;
