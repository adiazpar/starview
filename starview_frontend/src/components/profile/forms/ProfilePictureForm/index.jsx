/**
 * ProfilePictureForm Component
 *
 * Form component for uploading and removing profile pictures.
 * Includes validation for file size (5MB max) and file type (images only).
 */

import { useState, useEffect } from 'react';
import profileApi from '../../../../services/profile';
import Alert from '../../../shared/alert';
import './styles.css';

function ProfilePictureForm({ user, refreshAuth }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [profilePicture, setProfilePicture] = useState(
    user?.profile_picture_url || '/images/default_profile_pic.jpg'
  );

  // Update profile picture when user data changes
  useEffect(() => {
    if (user?.profile_picture_url) {
      setProfilePicture(user.profile_picture_url);
    }
  }, [user?.profile_picture_url]);

  const handlePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSuccess('');
    setError('');

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    setLoading(true);
    try {
      const response = await profileApi.uploadProfilePicture(file);
      setProfilePicture(response.data.image_url);
      setSuccess('Profile picture updated successfully!');
      await refreshAuth();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to upload image';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePictureRemove = async () => {
    if (!confirm('Are you sure you want to remove your profile picture?')) return;

    setSuccess('');
    setError('');

    setLoading(true);
    try {
      const response = await profileApi.removeProfilePicture();
      setProfilePicture(response.data.default_image_url);
      setSuccess('Profile picture removed successfully!');
      await refreshAuth();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to remove image';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-picture-section">
      <h3 className="profile-form-title">Profile Picture</h3>
      <p className="profile-form-description">
        Upload a photo to personalize your profile. This will be visible across the site.
      </p>

      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="profile-picture-upload">
        <div className="profile-picture-preview">
          <img src={profilePicture} alt="Profile" />
        </div>
        <div className="profile-picture-actions">
          <div className="profile-picture-buttons">
            <label htmlFor="profile-picture-input" className="btn">
              <i className="fa-solid fa-upload"></i>
              Upload Photo
            </label>
            <input
              id="profile-picture-input"
              type="file"
              accept="image/*"
              onChange={handlePictureUpload}
              className="profile-file-input"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handlePictureRemove}
              className="btn"
              disabled={loading}
            >
              <i className="fa-solid fa-trash"></i>
              Remove
            </button>
          </div>
          <p className="profile-picture-help">JPG, PNG or GIF. Max size 5MB.</p>
        </div>
      </div>
    </div>
  );
}

export default ProfilePictureForm;
