import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import useCooldown, { retryAfterSeconds } from '../../hooks/useCooldown';
import authApi from '../../services/auth';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const emailFromUrl = searchParams.get('email');
  const fromPage = searchParams.get('from');

  const [email, setEmail] = useState(emailFromUrl || '');
  const [loading, setLoading] = useState(false);
  const [countdown, startCountdown] = useCooldown();

  // Check if user is already verified (authenticated users)
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      // User is logged in and verified - redirect to home
      navigate('/');
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  // Get context message based on where user came from
  const getMessage = () => {
    if (fromPage === 'register') {
      return 'We sent a verification link to your email address. Click the link to activate your account.';
    } else if (fromPage === 'login') {
      return "Your account isn't verified yet. Check your email for the verification link or request a new one below.";
    } else {
      return 'Enter your email address to receive a new verification link.';
    }
  };

  const handleResendEmail = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!email) {
      showToast('Please enter your email address.', 'error');
      setLoading(false);
      return;
    }

    try {
      const { data } = await authApi.resendVerificationEmail({ email });
      showToast(data.detail, 'success');
      startCountdown(data.resend_after);
    } catch (error) {
      const detail = error.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'An error occurred. Please try again later.', 'error');
      startCountdown(retryAfterSeconds(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__card glass-card">
          {/* Icon */}
          <div className="verify-email-icon">
            <i className="fa-solid fa-envelope"></i>
          </div>

          {/* Header */}
          <div className="verify-email-header">
            <h1 className="verify-email-title">Verify your email</h1>
            <p className="verify-email-subtitle">{getMessage()}</p>
          </div>

          {/* Email Display/Input */}
          <div className="verify-email-form">
            {emailFromUrl ? (
              // Show email as read-only display
              <div className="verify-email-display">
                <label className="form-label">Email address</label>
                <div className="verify-email-address">{email}</div>
              </div>
            ) : (
              // Show email input field
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email address</label>
                <input
                  type="email"
                  id="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="email"
                />
              </div>
            )}

            {/* Resend Button */}
            <button
              onClick={handleResendEmail}
              className="btn-primary btn-primary--full"
              disabled={loading || countdown > 0}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="xs" inline />
                  Sending...
                </>
              ) : countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                'Resend verification email'
              )}
            </button>
          </div>

          {/* Helper Section */}
          <div className="verify-email-footer">
            <p className="verify-email-help-text">Didn't receive the email?</p>
            <p className="verify-email-help-text">Check your spam folder or try resending.</p>
            <Link to="/login" className="verify-email-back-link">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailPage;
