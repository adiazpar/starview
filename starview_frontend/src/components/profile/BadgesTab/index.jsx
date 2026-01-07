import { useState, useCallback, useEffect } from 'react';
import LoadingSpinner from '../../shared/LoadingSpinner';
import BadgeCard from '../../badges/BadgeCard';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

/**
 * BadgesTab - User's badge collection display
 *
 * Shows earned, in-progress, and locked badges
 * Allows pinning/unpinning of earned badges
 * Receives badge data from parent to avoid redundant API calls
 */
function BadgesTab({ pinnedBadgesHook, badgeData }) {
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  // Destructure the pinned badges hook passed from parent
  const {
    pinnedBadgeIds,
    togglePin,
    error: pinError,
    successMessage: pinSuccess,
    clearMessages
  } = pinnedBadgesHook;

  // Show toast notifications for pin/unpin operations
  useEffect(() => {
    if (pinError) {
      showToast(pinError, 'error');
      clearMessages();
    }
  }, [pinError, showToast, clearMessages]);

  useEffect(() => {
    if (pinSuccess) {
      showToast(pinSuccess, 'success');
      clearMessages();
    }
  }, [pinSuccess, showToast, clearMessages]);

  // Handle pin/unpin - memoized to prevent unnecessary BadgeCard re-renders
  const handlePinToggle = useCallback(async (badgeId) => {
    await togglePin(badgeId);
  }, [togglePin]);

  // Show loading if badge data hasn't been passed yet
  if (!badgeData) {
    return (
      <div className="profile-section">
        <LoadingSpinner size="lg" message="Loading badges..." />
      </div>
    );
  }

  // Show error toast and return empty state if error
  if (error) {
    showToast(error, 'error');
    setError(null);
  }

  const { earned, in_progress, locked } = badgeData;
  const totalBadges = (earned?.length || 0) + (in_progress?.length || 0) + (locked?.length || 0);

  return (
    <div className="profile-section">
      <h2 className="profile-section-title">My Badges</h2>
      <p className="profile-section-description">
        Track your achievements and progress
      </p>

      {/* Inline Badge Stats */}
      <div className="badge-inline-stats">
        <span className="badge-inline-stat">
          <strong>{earned?.length || 0}</strong> earned
        </span>
        <span className="badge-inline-divider">·</span>
        <span className="badge-inline-stat">
          <strong>{in_progress?.length || 0}</strong> in progress
        </span>
        <span className="badge-inline-divider">·</span>
        <span className="badge-inline-stat">
          <strong>{locked?.length || 0}</strong> locked
        </span>
      </div>

      {/* Pinned Badges Summary */}
      {pinnedBadgeIds.length > 0 && (
        <div className="badge-pinned-summary">
          <h3>
            <i className="fa-solid fa-thumbtack"></i> Pinned Badges ({pinnedBadgeIds.length}/3)
          </h3>
          <p>These badges are displayed on your public profile</p>
        </div>
      )}

      {/* Earned Badges */}
      {earned && earned.length > 0 && (
        <div className="badge-collection-section">
          <h3>Earned Badges ({earned.length})</h3>
          <p>Badges you have unlocked</p>
          <div className="badge-grid">
            {earned.map(item => (
              <BadgeCard
                key={item.badge_id}
                badge={{
                  id: item.badge_id,
                  name: item.name,
                  slug: item.slug,
                  description: item.description,
                  category: item.category,
                  tier: item.tier,
                  is_rare: item.is_rare,
                  icon_path: item.icon_path
                }}
                state="earned"
                earnedAt={item.earned_at}
                isPinned={pinnedBadgeIds.includes(item.badge_id)}
                canPin={true}
                onPin={handlePinToggle}
              />
            ))}
          </div>
        </div>
      )}

      {/* In-Progress Badges */}
      {in_progress && in_progress.length > 0 && (
        <div className="badge-collection-section">
          <h3>In Progress ({in_progress.length})</h3>
          <p>Badges with partial progress toward completion</p>
          <div className="badge-grid">
            {in_progress.map(item => (
              <BadgeCard
                key={item.badge_id}
                badge={{
                  id: item.badge_id,
                  name: item.name,
                  slug: item.slug,
                  description: item.description,
                  category: item.category,
                  tier: item.tier,
                  is_rare: item.is_rare,
                  icon_path: item.icon_path
                }}
                state="in-progress"
                progress={{
                  current: item.current_progress,
                  total: item.criteria_value,
                  percentage: item.percentage
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Locked Badges */}
      {locked && locked.length > 0 && (
        <div className="badge-collection-section">
          <h3>Locked ({locked.length})</h3>
          <p>Badges that haven't been started yet</p>
          <div className="badge-grid">
            {locked.map(item => (
              <BadgeCard
                key={item.badge_id}
                badge={{
                  id: item.badge_id,
                  name: item.name,
                  slug: item.slug,
                  description: item.description,
                  category: item.category,
                  tier: item.tier,
                  is_rare: item.is_rare,
                  icon_path: item.icon_path
                }}
                state="locked"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BadgesTab;
