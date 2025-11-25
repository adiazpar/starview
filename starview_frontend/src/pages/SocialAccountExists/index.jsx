import { Link } from 'react-router-dom';
import '../EmailConfirmError/styles.css'; // Reuse the same styling

function SocialAccountExistsPage() {
  return (
    <div className="email-confirm-error-page">
      <div className="error-container">
        <div className="error-icon">
          <i className="fa-solid fa-circle-info"></i>
        </div>

        <h1>Account Already Exists</h1>

        <p className="error-message">
          An account with this email address already exists. To use Google Sign-In with this account,
          please log in with your password first, then connect your Google account from your Profile settings.
        </p>

        <div className="error-actions">
          <Link to="/login" className="btn">
            <i className="fa-solid fa-right-to-bracket"></i>
            Sign In With Password
          </Link>
          <Link to="/password-reset" className="btn">
            <i className="fa-solid fa-key"></i>
            Forgot Password?
          </Link>
        </div>

        <div className="help-text">
          <p>
            <strong>Why am I seeing this?</strong>
          </p>
          <p>
            For security reasons, we don't automatically link social accounts to existing email addresses.
            This prevents unauthorized access to your account. Once you're logged in, you can safely connect
            your Google account from your Profile page.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SocialAccountExistsPage;
