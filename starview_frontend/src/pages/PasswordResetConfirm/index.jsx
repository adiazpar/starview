import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import authApi from '../../services/auth';
import Alert from '../../components/shared/Alert';
import './styles.css';

function PasswordResetConfirmPage() {
  const { uidb64, token } = useParams();
  const [formData, setFormData] = useState({
    password1: '',
    password2: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword1, setShowPassword1] = useState(false);
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

    // Basic validation
    if (formData.password1 !== formData.password2) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      await authApi.confirmPasswordReset(uidb64, token, {
        password1: formData.password1,
        password2: formData.password2
      });
      setSuccess(true);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to reset password. The link may be invalid or expired.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = passwordValidation.minLength &&
    passwordValidation.hasUppercase &&
    passwordValidation.hasNumber &&
    passwordValidation.hasSpecial &&
    passwordMatch;

  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__card glass-card">
        {success ? (
          <div className="password-reset-confirm-success">
            {/* Success Icon */}
            <div className="password-reset-confirm-success-icon">
              <i className="fa-solid fa-circle-check"></i>
            </div>

            <h2 className="password-reset-confirm-success-title">Password reset successful!</h2>
            <p className="password-reset-confirm-success-description">
              Your password has been successfully changed. You can now log in with your new password.
            </p>

            <Link to="/login" className="btn-primary btn-primary--full">
              Go to login
            </Link>
          </div>
        ) : (
          <>
            {/* Icon */}
            <div className="password-reset-confirm-icon">
              <i className="fa-solid fa-lock-open"></i>
            </div>

            {/* Header */}
            <div className="password-reset-confirm-header">
              <h1 className="password-reset-confirm-title">Create new password</h1>
              <p className="password-reset-confirm-subtitle">
                Your password must be strong and unique.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="password-reset-confirm-form">
              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => setError('')}
                />
              )}

              {/* New Password Field */}
              <div className="form-group">
                <label htmlFor="password1" className="form-label">
                  New password
                </label>
                <div className="password-reset-confirm-input-wrapper">
                  <input
                    type={showPassword1 ? 'text' : 'password'}
                    id="password1"
                    name="password1"
                    value={formData.password1}
                    onChange={handleChange}
                    className="form-input has-toggle"
                    placeholder="Enter new password"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword1(!showPassword1)}
                    aria-label={showPassword1 ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    <i className={`fa-solid ${showPassword1 ? 'fa-eye-slash' : 'fa-eye'}`}></i>
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
                <label htmlFor="password2" className="form-label">
                  Confirm new password
                </label>
                <div className="password-reset-confirm-input-wrapper">
                  <input
                    type={showPassword2 ? 'text' : 'password'}
                    id="password2"
                    name="password2"
                    value={formData.password2}
                    onChange={handleChange}
                    className="form-input has-toggle"
                    placeholder="Confirm new password"
                    required
                    disabled={loading}
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

              <button
                type="submit"
                className="btn-primary btn-primary--full"
                disabled={loading || !isFormValid}
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner animate-spin"></i>
                    Resetting password...
                  </>
                ) : (
                  'Reset password'
                )}
              </button>
            </form>

            <div className="password-reset-confirm-footer">
              <p className="password-reset-confirm-footer-text">
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

export default PasswordResetConfirmPage;
