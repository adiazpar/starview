import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import useProfileData from '../../hooks/useProfileData';
import useProfileNavigation from '../../hooks/useProfileNavigation';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProfileHeader from '../../components/profile/ProfileHeader';
import ProfileToolbar from '../../components/profile/ProfileToolbar';
import SettingsTab from '../../components/profile/SettingsTab';
import BadgesTab from '../../components/profile/BadgesTab';
import MyReviewsTab from '../../components/profile/MyReviewsTab';
import FavoritesTab from '../../components/profile/FavoritesTab';
import './styles.css';

function ProfilePage() {
  const { user, refreshAuth, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { goToOwnProfile } = useProfileNavigation(user?.username);
  const [activeTab, setActiveTab] = useState('settings');

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
      showToast('Social account connected successfully!', 'success');
      navigate('/profile', { replace: true });
    }
    if (params.get('social_disconnected') === 'true') {
      showToast('Social account disconnected successfully!', 'success');
      navigate('/profile', { replace: true });
    }
    if (params.get('error') === 'email_conflict') {
      showToast('This social account is already registered to another user.', 'error');
      navigate('/profile', { replace: true });
    }
    if (params.get('error') === 'social_already_connected') {
      showToast('This social account is already connected to another user.', 'error');
      navigate('/profile', { replace: true });
    }
  }, [location.search, navigate, showToast]);

  // Loading state - uses same LoadingSpinner as ProtectedRoute for seamless transition
  if (isLoading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Back always returns to your own public profile */}
        <ProfileToolbar onBack={goToOwnProfile} />

        {/* Profile Header - Using Shared Component */}
        <ProfileHeader
          user={user}
          isOwnProfile={true}
          onEditPage={true}
          pinnedBadges={pinnedBadges}
        />

        {/* Tab Navigation */}
        <div className="profile-tabs glass-card animate-fade-in-up animate-delay-1">
          {[
            { id: 'settings', label: 'Settings', icon: 'fa-gear' },
            { id: 'badges', label: 'Badges', icon: 'fa-award' },
            { id: 'reviews', label: 'My Reviews', icon: 'fa-star' },
            { id: 'favorites', label: 'Favorites', icon: 'fa-location-dot' },
          ].map(tab => <button
            key={tab.id}
            type="button"
            className={`profile-tab ${activeTab === tab.id ? 'active' : ''}`}
            aria-label={tab.label}
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
            <span className="profile-tab-text">{tab.label}</span>
          </button>)}
        </div>

        {/* Tab Content */}
        <div className="profile-content glass-card">
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
