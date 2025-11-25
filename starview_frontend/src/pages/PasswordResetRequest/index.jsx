import { useState } from 'react';
import { Link } from 'react-router-dom';
import authApi from '../../services/auth';
import Alert from '../../components/shared/alert';
import './styles.css';

function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.requestPasswordReset({ email });
      setSuccess(true);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to send password reset email. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-reset-container">
      <div className="password-reset-card">
        {/* Icon */}
        <div className="password-reset-icon">
          <i className="fa-solid fa-key"></i>
        </div>

        {/* Header */}
        <div className="password-reset-header">
          <h1 className="password-reset-title">Forgot Password?</h1>
          <p className="password-reset-subtitle">
            No worries, we'll send you reset instructions.
          </p>
        </div>

          {success ? (
            <div className="success-message-box">
              <h3 className="success-title">Check Your Email</h3>
              <p className="success-description">
                If an account exists with that email address, you will receive password reset instructions shortly.
              </p>

              <Link to="/login" className="btn" style={{ marginTop: '24px', display: 'inline-block' }}>
                Back to Login
              </Link>

              <p className="success-description security">
                The link will expire in 1 hour for security purposes.
              </p>
            </div>
        ) : (
          <form onSubmit={handleSubmit} className="password-reset-form">
            {error && (
              <Alert
                type="error"
                message={error}
                onClose={() => setError('')}
              />
            )}

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                className="form-input"
                placeholder="your.email@example.com"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn password-reset-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  Sending...
                </>
              ) : (
                <>
                  Send Reset Link
                </>
              )}
            </button>
          </form>
        )}

        {!success && (
          <div className="password-reset-footer">
            <p className="password-reset-footer-text">
              Remember your password?{' '}
              <Link to="/login">
                Back to Login
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PasswordResetRequestPage;
