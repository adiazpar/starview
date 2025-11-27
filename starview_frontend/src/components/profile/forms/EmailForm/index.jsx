/**
 * EmailForm Component
 *
 * Form component for updating email address.
 * Uses view/edit mode pattern for cleaner UX.
 * Requires email verification before the change takes effect.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/Alert';

function EmailForm({ user, refreshAuth }) {
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Update email when user data changes
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSuccess('');
    setError('');

    setLoading(true);
    try {
      const response = await profileApi.updateEmail({
        new_email: email,
      });

      // Check if verification is required
      if (response.data.verification_required) {
        setSuccess(response.data.detail);
      } else {
        setSuccess('Email updated successfully!');
        await refreshAuth();
      }
      setIsEditing(false);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to update email';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEmail(user?.email || '');
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  return (
    <div className="profile-form-section">
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Email Address</h3>
          <p className="profile-form-description">
            For security, you'll need to verify your new email address before the change takes effect.
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
          aria-label={isEditing ? "Cancel editing" : "Edit email address"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      {/* View Mode */}
      {!isEditing && (
        <div className="profile-view-content">
          <span className="profile-view-value">{user?.email}</span>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="profile-edit-content">
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <input
                type="email"
                id="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="your.email@example.com"
                aria-label="Email Address"
              />
            </div>
            <div className="profile-form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    Saving...
                  </>
                ) : (
                  'Save'
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

export default EmailForm;
