import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import authApi from '../../services/auth';
import Alert from '../../components/shared/Alert';
import './styles.css';

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Initialize rememberMe from localStorage
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('rememberMe');
    return saved === 'true';
  });

  // Get the redirect URL from query params (e.g., /login?next=/profile)
  const nextUrl = searchParams.get('next') || '/';

  // Check if redirected due to session expiry
  const sessionExpired = searchParams.get('expired') === 'true';
  const [showExpiredAlert, setShowExpiredAlert] = useState(sessionExpired);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({
        username: formData.username,
        password: formData.password,
        next: nextUrl,
        remember_me: rememberMe
      });

      // Login successful - redirect to specified URL
      const redirectUrl = response.data.redirect_url || nextUrl;
      window.location.href = redirectUrl;
    } catch (err) {
      // Backend always returns 'detail' field for all API errors
      // Check if error is due to unverified email
      const errorData = err.response?.data || {};
      const errorMessage = typeof errorData.detail === 'string' ? errorData.detail : errorData.detail?.detail || '';

      if (errorMessage.toLowerCase().includes('verify') || errorMessage.toLowerCase().includes('verification')) {
        // Use email from error response if available, otherwise use username
        const email = errorData.email || formData.username;
        navigate(`/verify-email?email=${encodeURIComponent(email)}&from=login`);
        return;
      }

      // Display other errors normally
      if (errorMessage) {
        setError(errorMessage);
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Unable to login. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    if (provider === 'Google') {
      // Redirect to Django allauth Google OAuth endpoint
      // Use relative URL to go through Vite proxy in development
      // In production, this will be handled by the backend directly
      window.location.href = '/accounts/google/login/?process=login';
    } else {
      // Other social logins coming soon
      alert(`${provider} login coming soon!`);
    }
  };

  return (
    <div className="login-container">
      {/* Hero Panel (Desktop Only) */}
      <div className="login-hero">
        <div className="login-hero-overlay">
          <h1 className="login-hero-title">
            Find Your Perfect
            <span className="login-hero-title-accent"> Dark Sky</span>
          </h1>
          <p className="login-hero-subtitle">
            Join a community of astronomers sharing the best locations
            for observing the night sky. Rate, review, and explore.
          </p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-content glass-card">
          {/* Header */}
          <div className="login-form-header">
            <h2 className="login-form-title">Welcome back</h2>
            <p className="login-form-subtitle">
              Sign in to continue exploring the cosmos
            </p>
          </div>

          {/* Session Expired Message */}
          {showExpiredAlert && !error && (
            <Alert
              type="warning"
              message="Your session has expired. Please sign in again."
              onClose={() => setShowExpiredAlert(false)}
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

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Username/Email Field */}
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Email or username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                className="form-input"
                placeholder="you@example.com"
                value={formData.username}
                onChange={handleChange}
                required
                autoComplete="username"
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="login-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  className="form-input has-toggle"
                  placeholder="Your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* Form Options */}
            <div className="login-form-options">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberMe(checked);
                    // Persist checkbox state to localStorage
                    localStorage.setItem('rememberMe', checked.toString());
                  }}
                  disabled={loading}
                />
                <span className="form-checkbox-label">Remember me</span>
              </label>
              <Link to="/password-reset" className="login-forgot-password">
                Forgot your password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-primary btn-primary--full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin"></i>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <div className="login-divider-line"></div>
            <span className="login-divider-text">or</span>
            <div className="login-divider-line"></div>
          </div>

          {/* Social Login Buttons */}
          <div className="login-social-buttons">
            <button
              type="button"
              className="btn-social btn-social--google"
              onClick={() => handleSocialLogin('Google')}
            >
              <i className="btn-social__icon fa-brands fa-google"></i>
            </button>

            <button
              type="button"
              className="btn-social btn-social--apple"
              onClick={() => handleSocialLogin('Apple')}
              disabled
            >
              <i className="btn-social__icon fa-brands fa-apple"></i>
            </button>

            <button
              type="button"
              className="btn-social btn-social--microsoft"
              onClick={() => handleSocialLogin('Microsoft')}
              disabled
            >
              <i className="btn-social__icon fa-brands fa-microsoft"></i>
            </button>
          </div>

          {/* Signup Link */}
          <div className="login-signup-link">
            <p className="login-signup-text">
              Don't have an account? <Link to="/register">Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
