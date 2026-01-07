import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import './styles.css';

function RegisterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password1: '',
    password2: ''
  });

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

  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      showToast(err.response?.data?.detail || 'Registration failed. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      {/* Hero Panel (Desktop Only) */}
      <div className="register-hero">
        {/* Telescope illustration - SVGRepo (CC0 License) */}
        <svg className="register-telescope" viewBox="0 0 512 512" aria-hidden="true">
          {/* Discovery star - what the telescope points at */}
          <circle cx="60" cy="40" r="12" className="discovery-star" />

          {/* Telescope body and lens */}
          <path className="telescope-body" d="M452.425,202.575l-38.269-23.11c-1.266-10.321-5.924-18.596-13.711-21.947l-86.843-52.444l-0.275,0.598
            c-3.571-7.653-9.014-13.553-16.212-16.668L166.929,10.412l-0.236,0.543v-0.016c-3.453-2.856-7.347-5.239-11.594-7.08
            c-32.315-13.923-74.124,11.013-93.38,55.716c-19.241,44.624-8.7,92.215,23.622,106.154c4.256,1.826,8.669,3.005,13.106,3.556
            l-0.19,0.464l146.548,40.669c7.19,3.107,15.206,3.004,23.229,0.37l-0.236,0.566L365.55,238.5
            c7.819,3.366,17.094,1.125,25.502-5.082l42.957,11.909c7.67,3.312,18.014-3.548,23.104-15.362
            C462.202,218.158,460.11,205.894,452.425,202.575z M154.516,99.56c-11.792,27.374-31.402,43.783-47.19,49.132
            c-6.962,2.281-13.176,2.556-17.605,0.637c-14.536-6.254-25.235-41.856-8.252-81.243c16.976-39.378,50.186-56.055,64.723-49.785
            c4.429,1.904,8.519,6.592,11.626,13.246C164.774,46.699,166.3,72.216,154.516,99.56z"/>

          {/* Tripod and stand */}
          <path className="telescope-tripod" d="M297.068,325.878c-1.959-2.706-2.25-6.269-0.724-9.25c1.518-2.981,4.562-4.846,7.913-4.846h4.468
            c4.909,0,8.889-3.972,8.889-8.897v-7.74c0-4.909-3.98-8.897-8.889-8.897h-85.789c-4.908,0-8.897,3.988-8.897,8.897v7.74
            c0,4.925,3.989,8.897,8.897,8.897h4.492c3.344,0,6.388,1.865,7.914,4.846c1.518,2.981,1.235,6.544-0.732,9.25L128.715,459.116
            c-3.225,4.287-2.352,10.36,1.927,13.569c4.295,3.225,10.368,2.344,13.578-1.943l107.884-122.17l4.036,153.738
            c0,5.333,4.342,9.691,9.691,9.691c5.358,0,9.692-4.358,9.692-9.691l4.043-153.738l107.885,122.17
            c3.209,4.287,9.282,5.168,13.568,1.943c4.288-3.209,5.145-9.282,1.951-13.569L297.068,325.878z"/>

          {/* Mount joint */}
          <circle className="telescope-mount" cx="265.831" cy="250.81" r="21.396"/>
        </svg>

        {/* Horizon silhouette - shared visual element with login */}
        <div className="register-horizon" aria-hidden="true">
          <svg viewBox="0 0 800 120" preserveAspectRatio="none">
            <path d="M0,120 L0,80 Q100,60 200,70 T400,50 T600,65 T800,55 L800,120 Z" className="horizon-mountain" />
            <path d="M0,120 L0,95 Q150,85 300,90 T600,80 T800,85 L800,120 Z" className="horizon-hill" />
          </svg>
        </div>

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
        <div className="register-form-content glass-card">
          {/* Header */}
          <div className="register-form-header">
            <h2 className="register-form-title">Create Account</h2>
            <p className="register-form-subtitle">Ready to embark on a cosmic adventure?</p>
          </div>

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
                  className="password-toggle"
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
                  className="password-toggle"
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
