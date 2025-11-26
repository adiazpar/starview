import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/auth';
import Alert from '../../components/shared/Alert';
import './styles.css';

function RegisterPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password1: '',
    password2: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  // Password validation state
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasNumber: false,
    hasSpecial: false
  });

  // Confirm password validation state
  const [passwordMatch, setPasswordMatch] = useState(false);

  // Validate password in real-time
  const validatePassword = (password) => {
    setPasswordValidation({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    });
  };

  // Validate password match
  const validatePasswordMatch = (password1, password2) => {
    setPasswordMatch(password2.length > 0 && password1 === password2);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    const newFormData = {
      ...formData,
      [name]: value
    };

    setFormData(newFormData);

    // Validate password as user types
    if (name === 'password1') {
      validatePassword(value);
      validatePasswordMatch(value, newFormData.password2);
    }

    // Validate password match as user types
    if (name === 'password2') {
      validatePasswordMatch(newFormData.password1, value);
    }

    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.register({
        username: formData.username,
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        password1: formData.password1,
        password2: formData.password2
      });

      // Check if email verification is required (production)
      if (response.data.requires_verification) {
        // Redirect to verify-email page with email address
        navigate(`/verify-email?email=${encodeURIComponent(formData.email)}&from=register`);
      } else {
        // Development mode - auto-logged in, redirect to home
        navigate(response.data.redirect_url || '/');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      {/* Hero Panel (Desktop Only) */}
      <div className="register-hero">
        <div className="register-hero-overlay">
          <h1 className="register-hero-title">
            Join the
            <span className="register-hero-title-accent"> Community</span>
          </h1>
          <p className="register-hero-subtitle">
            Create an account to share your stargazing discoveries, save favorite
            locations, and connect with astronomy enthusiasts around the world.
          </p>
        </div>
      </div>

      {/* Registration Form Panel */}
      <div className="register-form-panel">
        <div className="register-form-content">
          {/* Header */}
          <div className="register-form-header">
            <h2 className="register-form-title">Create Account</h2>
            <p className="register-form-subtitle">Ready to embark on a cosmic adventure?</p>
          </div>

          {/* Error Message */}
          {error && (
            <Alert
              type="error"
              message={error}
              onClose={() => setError('')}
            />
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="register-form">
            {/* Name Fields Row */}
            <div className="register-name-row">
              <div className="form-group">
                <label htmlFor="firstName" className="form-label">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  className="form-input"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  autoComplete="given-name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName" className="form-label">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  className="form-input"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            {/* Username Field */}
            <div className="form-group">
              <label htmlFor="username" className="form-label">Username (Optional)</label>
              <input
                type="text"
                id="username"
                name="username"
                className="form-input"
                placeholder="Choose a username (or leave blank)"
                value={formData.username}
                onChange={handleChange}
                disabled={loading}
                autoComplete="username"
              />
              <div className="form-hints">
                <span className="form-hint form-hint--info">
                  <i className="fa-solid fa-circle-info"></i>
                  Leave blank to auto-generate a unique username.
                </span>
              </div>
            </div>

            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                className="form-input"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                required
                autoComplete="email"
              />
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password1" className="form-label">Password</label>
              <div className="register-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password1"
                  name="password1"
                  className="form-input has-toggle"
                  placeholder="Create a password"
                  value={formData.password1}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="register-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>

              {/* Password Requirements */}
              <div className="form-hints">
                <span className={`form-hint ${passwordValidation.minLength ? 'form-hint--valid' : 'form-hint--error'}`}>
                  <i className={`fa-solid ${passwordValidation.minLength ? 'fa-check' : 'fa-xmark'}`}></i>
                  At least 8 characters long
                </span>
                <span className={`form-hint ${passwordValidation.hasUppercase ? 'form-hint--valid' : 'form-hint--error'}`}>
                  <i className={`fa-solid ${passwordValidation.hasUppercase ? 'fa-check' : 'fa-xmark'}`}></i>
                  At least 1 uppercase letter
                </span>
                <span className={`form-hint ${passwordValidation.hasNumber ? 'form-hint--valid' : 'form-hint--error'}`}>
                  <i className={`fa-solid ${passwordValidation.hasNumber ? 'fa-check' : 'fa-xmark'}`}></i>
                  At least 1 number
                </span>
                <span className={`form-hint ${passwordValidation.hasSpecial ? 'form-hint--valid' : 'form-hint--error'}`}>
                  <i className={`fa-solid ${passwordValidation.hasSpecial ? 'fa-check' : 'fa-xmark'}`}></i>
                  At least 1 special character (!@#$%^&*(),.?":{}|&lt;&gt;)
                </span>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="form-group">
              <label htmlFor="password2" className="form-label">Confirm Password</label>
              <div className="register-input-wrapper">
                <input
                  type={showPassword2 ? 'text' : 'password'}
                  id="password2"
                  name="password2"
                  className="form-input has-toggle"
                  placeholder="Confirm your password"
                  value={formData.password2}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="register-password-toggle"
                  onClick={() => setShowPassword2(!showPassword2)}
                  aria-label={showPassword2 ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <i className={`fa-solid ${showPassword2 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>

              {/* Password Match Requirement */}
              <div className="form-hints">
                <span className={`form-hint ${passwordMatch ? 'form-hint--valid' : 'form-hint--error'}`}>
                  <i className={`fa-solid ${passwordMatch ? 'fa-check' : 'fa-xmark'}`}></i>
                  Passwords match
                </span>
              </div>
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="register-login-link">
            <p className="register-login-text">
              Already have an account? <Link to="/login">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
