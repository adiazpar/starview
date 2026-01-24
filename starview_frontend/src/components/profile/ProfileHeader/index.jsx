import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { publicUserApi } from '../../../services/profile';
import PinnedBadges from '../../badges/PinnedBadges';
import BadgeModal from '../../badges/BadgeModal';
import ProfilePictureModal from '../../shared/ProfilePictureModal';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

/**
 * ProfileHeader Component
 *
 * Displays user profile header with avatar, name, username, bio, and join date.
 * Used by both private ProfilePage and public PublicProfilePage.
 *
 * Props:
 * - user: User object with profile data
 * - isOwnProfile: Boolean indicating if viewing own profile (shows action button)
 * - onEditPage: Boolean indicating if currently on the edit/settings page (shows "Back to Profile" instead of "Edit Profile")
 * - onShowBadgesClick: Optional callback function for "Show Badges" button click
 * - badgesVisible: Optional boolean to show if badges are currently visible
 * - pinnedBadges: Optional array of pinned badge objects to display
 * - onFollowChange: Optional callback when follow status changes (receives delta: +1 or -1)
 */
function ProfileHeader({ user, isOwnProfile = false, onEditPage = false, onShowBadgesClick, badgesVisible = false, pinnedBadges = [], onFollowChange }) {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Use the is_following value from the user object (from API)
  const [isFollowing, setIsFollowing] = useState(user?.is_following || false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [followerCount, setFollowerCount] = useState(user?.stats?.follower_count || 0);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [showProfilePictureModal, setShowProfilePictureModal] = useState(false);

  // Get profile picture URL (use default if none set)
  const profilePictureUrl = user?.profile_picture_url || '/images/default_profile_pic.jpg';

  // Format join date
  const joinDate = user?.date_joined
    ? new Date(user.date_joined).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      })
    : '';

  // Update follow status and follower count when user data changes
  useEffect(() => {
    if (user) {
      setIsFollowing(user.is_following || false);
      setFollowerCount(user.stats?.follower_count || 0);
    }
  }, [user?.is_following, user?.stats?.follower_count]);

  // Handle badge click - memoized to prevent unnecessary PinnedBadges re-renders
  const handleBadgeClick = useCallback((badge) => {
    setSelectedBadge(badge);
  }, []);

  // Handle follow/unfollow action
  const handleFollowToggle = async () => {
    if (!currentUser) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }

    setIsLoadingFollow(true);

    try {
      if (isFollowing) {
        // Unfollow
        const response = await publicUserApi.unfollowUser(user.username);
        setIsFollowing(false);
        setFollowerCount(prev => prev - 1);
        showToast(response.data.detail || `You have unfollowed ${user.username}.`, 'success');
        // Notify parent of follower count change
        onFollowChange?.(-1);
      } else {
        // Follow
        const response = await publicUserApi.followUser(user.username);
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        showToast(response.data.detail || `You are now following ${user.username}.`, 'success');
        // Notify parent of follower count change
        onFollowChange?.(1);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);

      // Extract error message from API response
      const errorMsg = error.response?.data?.detail
        || error.response?.data?.message
        || 'Failed to update follow status. Please try again.';

      showToast(errorMsg, 'error');
    } finally {
      setIsLoadingFollow(false);
    }
  };

  return (
    <div className="profile-header glass-card">
      <div className="profile-header-content">
        {/* Profile Picture */}
        <button
          className="profile-avatar-large"
          onClick={() => setShowProfilePictureModal(true)}
          aria-label="View profile picture"
        >
          <img
            src={profilePictureUrl}
            alt={`${user?.username}'s profile`}
            className="profile-avatar-img"
          />
        </button>

        {/* User Info and Badges Wrapper - No gap between them */}
        <div className="profile-info-badges-wrapper">
          {/* User Info */}
          <div className="profile-header-info">
            <div className="profile-name-username-row">
              <div className="profile-name-container">
                <div className="profile-name">
                  {user?.first_name && user?.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : 'No name set'
                  }
                </div>
                <p className="profile-username">@{user?.username}</p>
              </div>
              {/* Verification badge (only show if no pinned badges) */}
              {(!pinnedBadges || pinnedBadges.length === 0) && user?.is_verified && (
                <div className="verification-badge">
                  <i className="fa-solid fa-circle-check"></i>
                </div>
              )}
            </div>

            {/* Metadata Row */}
            <div className="profile-metadata">
              <span className="profile-metadata-item">
                <i className="fa-solid fa-calendar-days"></i>
                Joined {joinDate}
              </span>
            </div>
          </div>

          {/* Pinned Badges - Separate container side by side */}
          {pinnedBadges && pinnedBadges.length > 0 && (
            <div className="profile-badges-container">
              <PinnedBadges
                pinnedBadges={pinnedBadges}
                onBadgeClick={handleBadgeClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bio - Below header content */}
      {user?.bio && (
        <p className="profile-bio">
          <span>About Me</span>
          {user.bio}
        </p>
      )}

      {/* Action Buttons */}
      {isOwnProfile ? (
        // Own profile: Show edit buttons
        <div className={`profile-actions ${!user?.bio ? 'no-bio' : ''}`}>
          {onEditPage ? (
            // On edit page: Show "Back to Profile" button
            <Link to={`/users/${user?.username}`} className="btn-primary">
              <i className="fa-solid fa-caret-left"></i>
              Back
            </Link>
          ) : (
            // On public profile: Show "Edit Profile" button
            <Link to="/profile" className="btn-primary">
              <i className="fa-solid fa-gear"></i>
              Edit Profile
            </Link>
          )}
          {onShowBadgesClick && (
            <button onClick={onShowBadgesClick} className="btn-secondary">
              <i className="fa-solid fa-ranking-star"></i>
              {badgesVisible ? 'Hide' : 'Show'} Badges
            </button>
          )}
          <Link to="/profile" className="btn-secondary btn-secondary--icon">
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </Link>
        </div>
      ) : (
        // Other user's profile: Show follow button (redirects to login if not authenticated)
        <div className={`profile-actions ${!user?.bio ? 'no-bio' : ''}`}>
          <button
            className="btn-primary"
            onClick={handleFollowToggle}
            disabled={isLoadingFollow}
          >
            {isLoadingFollow ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                {isFollowing ? 'Unfollowing...' : 'Following...'}
              </>
            ) : (
              <>
                <i className={`fa-solid ${isFollowing ? 'fa-minus' : 'fa-plus'}`}></i>
                {isFollowing ? 'Unfollow' : 'Follow'}
              </>
            )}
          </button>
          {onShowBadgesClick && (
            <button onClick={onShowBadgesClick} className="btn-secondary">
              <i className="fa-solid fa-ranking-star"></i>
              {badgesVisible ? 'Hide' : 'Show'} Badges
            </button>
          )}
          <button className="btn-secondary btn-secondary--icon">
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      )}

      {/* Badge Detail Modal */}
      {selectedBadge && (
        <BadgeModal
          badge={{
            id: selectedBadge.badge_id,
            name: selectedBadge.name,
            slug: selectedBadge.slug,
            icon_path: selectedBadge.icon_path,
            tier: selectedBadge.tier,
            is_rare: selectedBadge.is_rare,
            category: selectedBadge.category,
            description: selectedBadge.description
          }}
          state="earned"
          earnedAt={selectedBadge.earned_at}
          onClose={() => setSelectedBadge(null)}
        />
      )}

      {/* Profile Picture Modal */}
      {showProfilePictureModal && (
        <ProfilePictureModal
          imageUrl={profilePictureUrl}
          username={user?.username}
          onClose={() => setShowProfilePictureModal(false)}
        />
      )}
    </div>
  );
}

export default ProfileHeader;
