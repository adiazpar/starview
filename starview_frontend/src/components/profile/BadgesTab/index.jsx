import { useState } from 'react';
import Alert from '../../shared/Alert';
import LoadingSpinner from '../../shared/LoadingSpinner';
import BadgeCard from '../../badges/BadgeCard';
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

  // Destructure the pinned badges hook passed from parent
  const {
    pinnedBadgeIds,
    togglePin,
    error: pinError,
    successMessage: pinSuccess,
    clearMessages
  } = pinnedBadgesHook;

  // Handle pin/unpin
  const handlePinToggle = async (badgeId) => {
    await togglePin(badgeId);
  };

  // Show loading if badge data hasn't been passed yet
  if (!badgeData) {
    return (
      <div className="profile-section">
        <LoadingSpinner size="lg" message="Loading badges..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-section">
        <Alert type="error" message={error} onClose={() => setError(null)} />
      </div>
    );
  }

  const { earned, in_progress, locked } = badgeData;
  const totalBadges = (earned?.length || 0) + (in_progress?.length || 0) + (locked?.length || 0);

  return (
    <div className="profile-section">
      <h2 className="profile-section-title">My Badges</h2>
      <p className="profile-section-description">
        Track your achievements and progress
      </p>

      {/* Pin Status Messages */}
      {pinError && (
        <Alert type="error" message={pinError} onClose={clearMessages} />
      )}
      {pinSuccess && (
        <Alert type="success" message={pinSuccess} onClose={clearMessages} />
      )}

      {/* Pinned Badges Summary */}
      {pinnedBadgeIds.length > 0 && (
        <div className="badge-pinned-summary">
          <h3>
            <i className="fa-solid fa-thumbtack"></i> Pinned Badges ({pinnedBadgeIds.length}/3)
          </h3>
          <p>These badges are displayed on your public profile</p>
        </div>
      )}

      {/* Badge Summary Stats */}
      <div className="badge-summary-stats">
        <div className="badge-stat-card">
          <span className="badge-stat-value">{earned?.length || 0}</span>
          <span className="badge-stat-label">Earned</span>
        </div>
        <div className="badge-stat-card">
          <span className="badge-stat-value">{in_progress?.length || 0}</span>
          <span className="badge-stat-label">In Progress</span>
        </div>
        <div className="badge-stat-card">
          <span className="badge-stat-value">{locked?.length || 0}</span>
          <span className="badge-stat-label">Locked</span>
        </div>
        <div className="badge-stat-card">
          <span className="badge-stat-value">{totalBadges}</span>
          <span className="badge-stat-label">Total</span>
        </div>
      </div>

      {/* Earned Badges */}
      {earned && earned.length > 0 && (
        <div className="badge-collection-section">
          <h3>
            <i className="fa-solid fa-check-circle"></i> Earned Badges ({earned.length})
          </h3>
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
          <h3>
            <i className="fa-solid fa-spinner"></i> In-Progress Badges ({in_progress.length})
          </h3>
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
          <h3>
            <i className="fa-solid fa-lock"></i> Locked Badges ({locked.length})
          </h3>
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
