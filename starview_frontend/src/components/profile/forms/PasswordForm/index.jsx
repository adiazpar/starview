/**
 * PasswordForm Component
 *
 * Form component for changing or setting password.
 * Uses view/edit mode pattern for cleaner UX.
 * Includes real-time password validation and match checking.
 */

import { useState } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';
import usePasswordValidation from '../../../../hooks/usePasswordValidation';
import './styles.css';

function PasswordForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const {
    passwordValidation,
    passwordMatch,
    validatePassword,
    validatePasswordMatch,
    isPasswordValid,
    resetValidation,
  } = usePasswordValidation();

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSuccess('');
    setError('');

    // Validate all password requirements are met
    if (!isPasswordValid()) {
      setError('Please meet all password requirements');
      return;
    }

    // Validate passwords match
    if (!passwordMatch) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await profileApi.updatePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });

      setSuccess('Password updated successfully!');

      // Clear password fields and validation state
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      resetValidation();
      setIsEditing(false);

      // Refresh user data to update has_usable_password status
      await refreshAuth();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to update password';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPasswordData({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
    resetValidation();
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">
            {user?.has_usable_password ? 'Password' : 'Set Password'}
          </h3>
          <p className="profile-form-description">
            {user?.has_usable_password
              ? 'Update your password to keep your account secure.'
              : 'Set a password to enable password-based login in addition to your social account.'}
          </p>
        </div>
        <button
          type="button"
          className="profile-edit-btn"
          onClick={() => {
            if (isEditing) {
              handleCancel();
            } else {
              setIsEditing(true);
            }
          }}
          aria-label={isEditing ? "Cancel editing" : (user?.has_usable_password ? 'Change password' : 'Set password')}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className={`profile-view-value ${!user?.has_usable_password ? 'profile-view-value--empty' : ''}`}>
            {user?.has_usable_password ? '••••••••••••' : 'Not set (using social login)'}
          </span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          {!user?.has_usable_password && (
            <p className="form-info">
              <i className="fa-solid fa-info-circle"></i> You currently sign in with a social account
              only.
            </p>
          )}

          <form onSubmit={handleSubmit} className="profile-form">
            {/* Hidden username field for accessibility and password managers */}
            <input
              type="text"
              name="username"
              value={user?.username || ''}
              autoComplete="username"
              readOnly
              style={{ display: 'none' }}
              aria-hidden="true"
            />

            {user?.has_usable_password && (
              <div className="form-group">
                <label htmlFor="current-password" className="form-label">
                  Current Password
                </label>
                <div className="profile-password-input-wrapper">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    id="current-password"
                    className="form-input"
                    value={passwordData.current_password}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, current_password: e.target.value })
                    }
                    placeholder="Enter your current password"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="profile-password-toggle"
                    onClick={() =>
                      setShowPasswords({ ...showPasswords, current: !showPasswords.current })
                    }
                    tabIndex={-1}
                  >
                    <i
                      className={`fa-solid ${showPasswords.current ? 'fa-eye-slash' : 'fa-eye'}`}
                    ></i>
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="new-password" className="form-label">
                New Password
              </label>
              <div className="profile-password-input-wrapper">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  id="new-password"
                  className="form-input"
                  value={passwordData.new_password}
                  onChange={(e) => {
                    const newPassword = e.target.value;
                    setPasswordData({ ...passwordData, new_password: newPassword });
                    validatePassword(newPassword);
                    validatePasswordMatch(newPassword, passwordData.confirm_password);
                  }}
                  placeholder="Create a password"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="profile-password-toggle"
                  onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  tabIndex={-1}
                >
                  <i className={`fa-solid ${showPasswords.new ? 'fa-eye-slash' : 'fa-eye'}`}></i>
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

            <div className="form-group">
              <label htmlFor="confirm-password" className="form-label">
                Confirm New Password
              </label>
              <div className="profile-password-input-wrapper">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  id="confirm-password"
                  className="form-input"
                  value={passwordData.confirm_password}
                  onChange={(e) => {
                    const confirmPassword = e.target.value;
                    setPasswordData({ ...passwordData, confirm_password: confirmPassword });
                    validatePasswordMatch(passwordData.new_password, confirmPassword);
                  }}
                  placeholder="Confirm your password"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="profile-password-toggle"
                  onClick={() =>
                    setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })
                  }
                  tabIndex={-1}
                >
                  <i
                    className={`fa-solid ${showPasswords.confirm ? 'fa-eye-slash' : 'fa-eye'}`}
                  ></i>
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

            <div className="profile-form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    {user?.has_usable_password ? 'Changing...' : 'Setting...'}
                  </>
                ) : (
                  user?.has_usable_password ? 'Change Password' : 'Set Password'
                )}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default PasswordForm;
