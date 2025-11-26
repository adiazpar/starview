import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../components/shared/Alert';
import './styles.css';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  const emailFromUrl = searchParams.get('email');
  const fromPage = searchParams.get('from');

  const [email, setEmail] = useState(emailFromUrl || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [canResend, setCanResend] = useState(true);
  const [alreadyVerified, setAlreadyVerified] = useState(false);

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

  // Countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleResendEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!email) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/resend-verification/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.detail || 'Verification email sent! Check your inbox.');
        setCountdown(60);
        setCanResend(false);
      } else {
        // Check if error is because email is already verified
        const errorMessage = data.detail || '';
        if (errorMessage.toLowerCase().includes('already verified')) {
          setAlreadyVerified(true);
          setError('');
        } else {
          setError(errorMessage || 'Failed to send verification email. Please try again.');
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verify-email-container">
      <div className="verify-email-navbar-spacer"></div>
      <div className="verify-email-content">
        <div className="verify-email-card">
        {alreadyVerified ? (
          // Show success state for already verified email
          <div className="verify-email-verified">
            <div className="verify-email-verified-icon">
              <i className="fa-solid fa-circle-check"></i>
            </div>

            <h2 className="verify-email-verified-title">Already verified</h2>
            <p className="verify-email-verified-description">
              Your email is already verified. You can log in now!
            </p>

            <Link to="/login" className="btn-primary btn-primary--full">
              Go to login
            </Link>
          </div>
        ) : (
          <>
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

              {/* Success Message */}
              {success && (
                <Alert
                  type="success"
                  message={success}
                  onClose={() => setSuccess('')}
                />
              )}

              {/* Error Message */}
              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => setError('')}
                />
              )}

              {/* Resend Button */}
              <button
                onClick={handleResendEmail}
                className="btn-primary btn-primary--full"
                disabled={loading || !canResend}
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner animate-spin"></i>
                    Sending...
                  </>
                ) : !canResend ? (
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
          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailPage;
