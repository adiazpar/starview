/**
 * ProfilePictureForm Component
 *
 * Form component for uploading and removing profile pictures.
 * Uses view/edit mode pattern for cleaner UX.
 * Includes validation for file size (5MB max) and file type (images only).
 * Supports deep-linking via scrollTo prop.
 */

import { useState, useEffect, useRef } from 'react';
import profileApi from '../../../../services/profile';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../shared/LoadingSpinner';
import './styles.css';

function ProfilePictureForm({ user, refreshAuth, scrollTo = false }) {
  const fileInputRef = useRef(null);
  const sectionRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const [profilePicture, setProfilePicture] = useState(
    user?.profile_picture_url || '/images/default_profile_pic.jpg'
  );

  // Update profile picture when user data changes
  useEffect(() => {
    if (user?.profile_picture_url) {
      setProfilePicture(user.profile_picture_url);
    }
  }, [user?.profile_picture_url]);

  // Scroll to this section when linked from another page
  useEffect(() => {
    if (scrollTo && sectionRef.current) {
      // Small delay to ensure collapsible section is expanded
      setTimeout(() => {
        sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [scrollTo]);

  const handlePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await profileApi.uploadProfilePicture(file);
      setProfilePicture(response.data.image_url);
      showToast('Profile picture updated successfully!', 'success');
      setIsEditing(false);
      await refreshAuth();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to upload image';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePictureRemove = async () => {
    if (!confirm('Are you sure you want to remove your profile picture?')) return;

    setLoading(true);
    try {
      const response = await profileApi.removeProfilePicture();
      setProfilePicture(response.data.default_image_url);
      showToast('Profile picture removed successfully!', 'success');
      setIsEditing(false);
      await refreshAuth();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to remove image';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className="profile-form-section" ref={sectionRef}>
      {/* Header with Edit button */}
      <div className="profile-form-header">
        <div className="profile-form-header-content">
          <h3 className="profile-form-title">Profile Picture</h3>
          <p className="profile-form-description">
            Upload a photo to personalize your profile. This will be visible across the site.
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
          aria-label={isEditing ? "Cancel editing" : "Edit profile picture"}
        >
          <i className={`fa-solid ${isEditing ? 'fa-xmark' : 'fa-pencil'}`}></i>
        </button>
      </div>

      {/* Edit Mode - Picture and actions visible */}
      {isEditing && (
        <div className="profile-edit-content">
          <div className="profile-picture-upload">
            <div className="profile-picture-preview">
              <img src={profilePicture} alt="Profile" />
            </div>
            <div className="profile-picture-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePictureUpload}
                className="profile-file-input"
                disabled={loading}
              />
              <div className="profile-form-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="xs" inline />
                      Uploading...
                    </>
                  ) : (
                    'Upload'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePictureRemove}
                  className="btn-secondary"
                  disabled={loading}
                >
                  Remove
                </button>
              </div>
              <p className="profile-picture-help">JPG, PNG or GIF. Max size 5MB.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePictureForm;
