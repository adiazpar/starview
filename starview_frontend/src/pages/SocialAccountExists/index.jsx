import { Link } from 'react-router-dom';
import './styles.css';

function SocialAccountExistsPage() {
  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__card glass-card">
        {/* Icon */}
        <div className="social-account-exists-icon">
          <i className="fa-solid fa-circle-info"></i>
        </div>

        {/* Title */}
        <h1 className="social-account-exists-title">Account already exists</h1>

        {/* Message */}
        <p className="social-account-exists-message">
          An account with this email address already exists. To use Google Sign-In with this account,
          please log in with your password first, then connect your Google account from your Profile settings.
        </p>

        {/* Actions */}
        <div className="social-account-exists-actions">
          <Link to="/login" className="btn-primary btn-primary--full">
            <i className="fa-solid fa-right-to-bracket"></i>
            Sign in with password
          </Link>
          <Link to="/password-reset" className="btn-secondary" style={{ width: '100%' }}>
            <i className="fa-solid fa-key"></i>
            Forgot password?
          </Link>
        </div>

        {/* Help Text */}
        <div className="social-account-exists-help">
          <p className="social-account-exists-help-title">Why am I seeing this?</p>
          <p className="social-account-exists-help-text">
            For security reasons, we don't automatically link social accounts to existing email addresses.
            This prevents unauthorized access to your account. Once you're logged in, you can safely connect
            your Google account from your Profile page.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

export default SocialAccountExistsPage;
