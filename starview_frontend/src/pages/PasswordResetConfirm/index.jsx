import { useState, useEffect } from 'react';
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

  return (
    <div className="password-reset-confirm-container">
      <div className="password-reset-confirm-card">
        {/* Icon */}
        <div className="password-reset-confirm-icon">
          <i className="fa-solid fa-lock-open"></i>
        </div>

        {/* Header */}
        <div className="password-reset-confirm-header">
          <h1 className="password-reset-confirm-title">Create New Password</h1>
          <p className="password-reset-confirm-subtitle">
            Your password must be strong and unique.
          </p>
        </div>

          {success ? (
            <div className="success-message-box">
              <h3 className="success-title">Password Reset Successful!</h3>
              <p className="success-description">
                Your password has been successfully changed. You can now log in with your new password.
              </p>
              <Link to="/login" className="btn" style={{ marginTop: '24px', display: 'inline-block' }}>
                Go to Login
              </Link>
            </div>
        ) : (
          <form onSubmit={handleSubmit} className="password-reset-confirm-form">
              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => setError('')}
                />
              )}

              <div className="form-group">
                <label htmlFor="password1" className="form-label">
                  New Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword1 ? 'text' : 'password'}
                    id="password1"
                    name="password1"
                    value={formData.password1}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Enter new password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword1(!showPassword1)}
                    tabIndex="-1"
                  >
                    <i className={`fa-solid fa-eye${showPassword1 ? '-slash' : ''}`}></i>
                  </button>
                </div>

                {/* Password Requirements */}
                <div className="register-password-requirements">
                  <ul>
                    <li className={passwordValidation.minLength ? 'valid' : ''}>
                      <i className={`fa-solid ${passwordValidation.minLength ? 'fa-check' : 'fa-xmark'}`}></i>
                      At least 8 characters long
                    </li>
                    <li className={passwordValidation.hasUppercase ? 'valid' : ''}>
                      <i className={`fa-solid ${passwordValidation.hasUppercase ? 'fa-check' : 'fa-xmark'}`}></i>
                      At least 1 uppercase letter
                    </li>
                    <li className={passwordValidation.hasNumber ? 'valid' : ''}>
                      <i className={`fa-solid ${passwordValidation.hasNumber ? 'fa-check' : 'fa-xmark'}`}></i>
                      At least 1 number
                    </li>
                    <li className={passwordValidation.hasSpecial ? 'valid' : ''}>
                      <i className={`fa-solid ${passwordValidation.hasSpecial ? 'fa-check' : 'fa-xmark'}`}></i>
                      At least 1 special character (!@#$%^&*(),.?":{}|&lt;&gt;)
                    </li>
                  </ul>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password2" className="form-label">
                  Confirm New Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword2 ? 'text' : 'password'}
                    id="password2"
                    name="password2"
                    value={formData.password2}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Confirm new password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword2(!showPassword2)}
                    tabIndex="-1"
                  >
                    <i className={`fa-solid fa-eye${showPassword2 ? '-slash' : ''}`}></i>
                  </button>
                </div>

                {/* Password Match Requirement */}
                <div className="register-password-requirements">
                  <ul>
                    <li className={passwordMatch ? 'valid' : ''}>
                      <i className={`fa-solid ${passwordMatch ? 'fa-check' : 'fa-xmark'}`}></i>
                      Passwords match
                    </li>
                  </ul>
                </div>
              </div>

            <button
              type="submit"
              className="btn password-reset-confirm-btn"
              disabled={loading || !passwordValidation.minLength || !passwordValidation.hasUppercase || !passwordValidation.hasNumber || !passwordValidation.hasSpecial || !passwordMatch}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  Resetting Password...
                </>
              ) : (
                <>
                  Reset Password
                </>
              )}
            </button>
          </form>
        )}

        {!success && (
          <div className="password-reset-confirm-footer">
            <p className="password-reset-confirm-footer-text">
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

export default PasswordResetConfirmPage;
