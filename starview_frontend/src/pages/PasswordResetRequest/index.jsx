import { useState } from 'react';
import { Link } from 'react-router-dom';
import authApi from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import './styles.css';

function PasswordResetRequestPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authApi.requestPasswordReset({ email });
      setSuccess(true);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to send password reset email. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__card glass-card">
        {success ? (
          <div className="password-reset-success">
            {/* Success Icon */}
            <div className="password-reset-success-icon">
              <i className="fa-solid fa-circle-check"></i>
            </div>

            <h2 className="password-reset-success-title">Check your email</h2>
            <p className="password-reset-success-description">
              If an account exists with that email address, you will receive password reset instructions shortly.
            </p>

            <Link to="/login" className="btn-primary btn-primary--full">
              Back to login
            </Link>

            <p className="password-reset-success-note">
              <i className="fa-solid fa-clock"></i>
              The link will expire in 1 hour for security purposes.
            </p>
          </div>
        ) : (
          <>
            {/* Icon */}
            <div className="password-reset-icon">
              <i className="fa-solid fa-key"></i>
            </div>

            {/* Header */}
            <div className="password-reset-header">
              <h1 className="password-reset-title">Forgot password?</h1>
              <p className="password-reset-subtitle">
                No worries, we'll send you reset instructions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="password-reset-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                className="btn-primary btn-primary--full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner animate-spin"></i>
                    Sending...
                  </>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>

            <div className="password-reset-footer">
              <p className="password-reset-footer-text">
                Remember your password? <Link to="/login">Back to login</Link>
              </p>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetRequestPage;
