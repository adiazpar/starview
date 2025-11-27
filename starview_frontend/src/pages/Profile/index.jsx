import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import useProfileData from '../../hooks/useProfileData';
import Alert from '../../components/shared/Alert';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProfileHeader from '../../components/profile/ProfileHeader';
import SettingsTab from '../../components/profile/SettingsTab';
import BadgesTab from '../../components/profile/BadgesTab';
import MyReviewsTab from '../../components/profile/MyReviewsTab';
import FavoritesTab from '../../components/profile/FavoritesTab';
import './styles.css';

function ProfilePage() {
  const { user, refreshAuth, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('settings');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Use React Query hook for profile data (cached, deduplicated)
  const {
    badgeData,
    pinnedBadges,
    socialAccounts,
    isLoading: dataLoading,
    refreshSocialAccounts,
    pinnedBadgesHook,
  } = useProfileData();

  // Combined loading state - shows spinner for BOTH auth and data loading
  // This prevents the flash between auth spinner and data spinner
  const isLoading = authLoading || dataLoading;

  // Check for social account connection success/errors
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('social_connected') === 'true') {
      setSuccessMessage('Social account connected successfully!');
      navigate('/profile', { replace: true });
    }
    if (params.get('social_disconnected') === 'true') {
      setSuccessMessage('Social account disconnected successfully!');
      navigate('/profile', { replace: true });
    }
    if (params.get('error') === 'email_conflict') {
      setErrorMessage('This social account is already registered to another user.');
      navigate('/profile', { replace: true });
    }
    if (params.get('error') === 'social_already_connected') {
      setErrorMessage('This social account is already connected to another user.');
      navigate('/profile', { replace: true });
    }
  }, [location.search, navigate]);

  // Loading state - uses same LoadingSpinner as ProtectedRoute for seamless transition
  if (isLoading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Profile Header - Using Shared Component */}
        <ProfileHeader
          user={user}
          isOwnProfile={true}
          onEditPage={true}
          pinnedBadges={pinnedBadges}
        />

        {/* Success Message */}
        {successMessage && (
          <Alert
            type="success"
            message={successMessage}
            onClose={() => setSuccessMessage('')}
          />
        )}

        {/* Error Message */}
        {errorMessage && (
          <Alert
            type="error"
            message={errorMessage}
            onClose={() => setErrorMessage('')}
          />
        )}

        {/* Tab Navigation */}
        <div className="profile-tabs animate-fade-in-up animate-delay-1">
          <button
            className={`profile-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <i className="fa-solid fa-gear"></i>
            <span className="profile-tab-text">Settings</span>
          </button>
          <button
            className={`profile-tab ${activeTab === 'badges' ? 'active' : ''}`}
            onClick={() => setActiveTab('badges')}
          >
            <i className="fa-solid fa-award"></i>
            <span className="profile-tab-text">Badges</span>
          </button>
          <button
            className={`profile-tab ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <i className="fa-solid fa-star"></i>
            <span className="profile-tab-text">My Reviews</span>
          </button>
          <button
            className={`profile-tab ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            <i className="fa-solid fa-location-dot"></i>
            <span className="profile-tab-text">Favorites</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="profile-content">
          {activeTab === 'settings' && (
            <SettingsTab
              user={user}
              refreshAuth={refreshAuth}
              socialAccounts={socialAccounts}
              onRefreshSocialAccounts={refreshSocialAccounts}
            />
          )}
          {activeTab === 'badges' && (
            <BadgesTab
              user={user}
              pinnedBadgesHook={pinnedBadgesHook}
              badgeData={badgeData}
            />
          )}
          {activeTab === 'reviews' && (
            <MyReviewsTab />
          )}
          {activeTab === 'favorites' && (
            <FavoritesTab />
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
