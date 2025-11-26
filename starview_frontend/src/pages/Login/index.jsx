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
        <div className="login-hero-attribution">
          Designed by Freepik
        </div>
        <div className="login-hero-overlay">
          <h1 className="login-hero-title">Discover The Universe</h1>
          <p className="login-hero-subtitle">
            Explore breathtaking stargazing locations, share your cosmic discoveries,
            and connect with fellow astronomy enthusiasts around the world.
          </p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-content">
          {/* Header */}
          <div className="login-form-header">
            <h2 className="login-form-title">Your Gateway To The Stars</h2>
            <p className="login-form-subtitle">
              Ready to embark on your next stargazing adventure? Log in now and start your next journey.
            </p>
          </div>

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
                Username or Email
              </label>
              <input
                type="text"
                id="username"
                name="username"
                className="form-input"
                placeholder="Enter your username or email"
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
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="login-password-toggle"
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
              <div className="login-remember-me">
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
                <label htmlFor="remember">Remember me</label>
              </div>
              <Link to="/password-reset" className="login-forgot-password">
                Forgot your password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn login-btn-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner login-spinner"></i>
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <span>Login</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <div className="login-divider-line"></div>
            <span className="login-divider-text">Or</span>
            <div className="login-divider-line"></div>
          </div>

          {/* Social Login Buttons */}
          <div className="login-social-buttons">
            <button
              type="button"
              className="btn login-btn-social login-btn-google"
              onClick={() => handleSocialLogin('Google')}
            >
              <i className="login-social-icon fa-brands fa-google"></i>
            </button>

            <button
              type="button"
              className="btn login-btn-social login-btn-apple"
              onClick={() => handleSocialLogin('Apple')}
              disabled
            >
              <i className="login-social-icon fa-brands fa-apple"></i>
            </button>

            <button
              type="button"
              className="btn login-btn-social login-btn-microsoft"
              onClick={() => handleSocialLogin('Microsoft')}
              disabled
            >
              <i className="login-social-icon fa-brands fa-microsoft"></i>
            </button>
          </div>

          {/* Signup Link */}
          <div className="login-signup-link">
            <p className="login-signup-text">
              New to Starview? <Link to="/register">Create an Account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
