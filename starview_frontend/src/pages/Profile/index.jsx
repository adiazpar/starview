import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import profileApi from '../../services/profile';
import { mapBadgeIdsToBadges } from '../../utils/badges';
import usePinnedBadges from '../../hooks/usePinnedBadges';
import Alert from '../../components/shared/Alert';
import ProfileHeader from '../../components/profile/ProfileHeader';
import SettingsTab from '../../components/profile/SettingsTab';
import BadgesTab from '../../components/profile/BadgesTab';
import MyReviewsTab from '../../components/profile/MyReviewsTab';
import FavoritesTab from '../../components/profile/FavoritesTab';
import './styles.css';

function ProfilePage() {
  const { user, refreshAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('settings');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [badgeData, setBadgeData] = useState(null);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Use the pinned badges hook in operation-only mode (no auto-fetch)
  const pinnedBadgesHook = usePinnedBadges(false);

  // Derive pinned badges from badgeData and pinnedBadgeIds (computed value, not state)
  const pinnedBadges = useMemo(() => {
    if (!badgeData || !pinnedBadgesHook.pinnedBadgeIds) return [];
    const earnedBadges = badgeData.earned || [];
    return mapBadgeIdsToBadges(pinnedBadgesHook.pinnedBadgeIds, earnedBadges);
  }, [badgeData, pinnedBadgesHook.pinnedBadgeIds]);

  // Fetch all profile data once on mount
  useEffect(() => {
    const fetchProfileData = async () => {
      setLoading(true);
      try {
        // Fetch badges and social accounts in parallel
        const [badgesResponse, socialResponse] = await Promise.all([
          profileApi.getMyBadgeCollection(),
          profileApi.getSocialAccounts()
        ]);

        // Store full badge data for BadgesTab
        setBadgeData(badgesResponse.data);

        // Extract pinned badge IDs from the badge response
        const pinnedBadgeIds = badgesResponse.data.pinned_badge_ids || [];

        // Initialize the hook with the pinned badge IDs (without fetching)
        // The useMemo above will automatically compute pinnedBadges when this updates
        pinnedBadgesHook.updatePinnedBadgeIds(pinnedBadgeIds);

        // Store social accounts for ConnectedAccountsSection
        setSocialAccounts(socialResponse.data.social_accounts || []);
      } catch (err) {
        console.error('Error fetching profile data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Refresh social accounts after connect/disconnect
  const refreshSocialAccounts = async () => {
    try {
      const response = await profileApi.getSocialAccounts();
      setSocialAccounts(response.data.social_accounts || []);
    } catch (err) {
      console.error('Error refreshing social accounts:', err);
    }
  };

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

  // Loading state
  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
            <p style={{ marginTop: '16px' }}>Loading profile...</p>
          </div>
        </div>
      </div>
    );
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
        <div className="profile-tabs">
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
