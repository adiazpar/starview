/**
 * EmailForm Component
 *
 * Form component for updating email address.
 * Requires email verification before the change takes effect.
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/alert';

function EmailForm({ user, refreshAuth }) {
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
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to update email';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-form-section">
      <h3 className="profile-form-title">Email Address</h3>
      <p className="profile-form-description">
        For security, you'll need to verify your new email address before the change takes effect.
      </p>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

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
          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Updating...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save"></i>
                Update Email
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EmailForm;
