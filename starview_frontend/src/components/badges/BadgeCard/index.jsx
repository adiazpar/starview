import React from 'react';
import './styles.css';

/**
 * BadgeCard Component
 *
 * Displays an individual badge with icon, name, description, and progress.
 * Supports three states: earned, in-progress, and locked.
 *
 * Props:
 * - badge: Object containing badge data
 *   - id: Badge ID
 *   - name: Badge name
 *   - slug: Badge slug (for icon filename)
 *   - description: Badge description
 *   - category: Badge category (EXPLORATION, CONTRIBUTION, etc.)
 *   - icon_path: Path to badge icon (e.g., '/badges/first-light.png')
 * - state: 'earned' | 'in-progress' | 'locked'
 * - progress: Object (for in-progress state)
 *   - current: Current progress value
 *   - total: Total required value
 *   - percentage: Progress percentage (0-100)
 * - earnedAt: Date when badge was earned (for earned state)
 * - isPinned: Boolean indicating if badge is pinned
 * - canPin: Boolean indicating if user can pin/unpin (owner only)
 * - onPin: Function to call when pin/unpin clicked
 */
function BadgeCard({
  badge,
  state = 'locked',
  progress = null,
  earnedAt = null,
  isPinned = false,
  canPin = false,
  onPin = null
}) {
  if (!badge) return null;

  const isEarned = state === 'earned';
  const isInProgress = state === 'in-progress';
  const isLocked = state === 'locked';

  // Format earned date
  const formatEarnedDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Handle pin/unpin click
  const handlePinClick = (e) => {
    e.stopPropagation(); // Prevent card click event
    if (onPin && canPin && isEarned) {
      onPin(badge.id);
    }
  };

  // Simple tier color logic: rare badges are purple, otherwise use tier
  const getTierColor = () => {
    // All rare badges are purple
    if (badge.is_rare) {
      return 'purple';
    }

    // Standard tier colors for non-rare badges
    const tierColors = {
      1: 'bronze',
      2: 'silver',
      3: 'gold',
      4: 'diamond',
      5: 'elite'
    };

    return tierColors[badge.tier] || 'bronze';
  };

  const tierColorClass = `badge-tier-${getTierColor()}`;

  return (
    <div className={`badge-card badge-card-${state} ${tierColorClass} ${isPinned ? 'badge-card-pinned' : ''}`}>
      {/* Badge Icon */}
      <div className="badge-card-icon-wrapper">
        <img
          src={badge.icon_path}
          alt={badge.name}
          className={`badge-card-icon ${isLocked ? 'badge-card-icon-locked' : ''}`}
        />

        {/* Earned checkmark */}
        {isEarned && (
          <div className="badge-card-earned-badge">
            <i className="fa-solid fa-check"></i>
          </div>
        )}
      </div>

      {/* Badge Info */}
      <div className="badge-card-content">
        <div className="badge-card-header">
          <h3 className="badge-card-name">{badge.name}</h3>
          {badge.category && (
            <span className={`badge-card-category badge-category-${badge.category.toLowerCase()}`}>
              {badge.category}
            </span>
          )}
        </div>

        <p className="badge-card-description">{badge.description}</p>

        {/* Progress Bar (in-progress state) */}
        {isInProgress && progress && (
          <div className="badge-card-progress">
            <div className="badge-card-progress-bar">
              <div
                className="badge-card-progress-fill"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="badge-card-progress-text">
              {progress.current} / {progress.total} ({progress.percentage}%)
            </div>
          </div>
        )}

        {/* Earned Date */}
        {isEarned && earnedAt && (
          <div className="badge-card-earned-date">
            <i className="fa-solid fa-calendar-check"></i>
            <span>Earned {formatEarnedDate(earnedAt)}</span>
          </div>
        )}

        {/* Locked Message */}
        {isLocked && (
          <div className="badge-card-locked-message">
            <i className="fa-solid fa-lock"></i>
            <span>Not yet unlocked</span>
          </div>
        )}
      </div>

      {/* Pin/Unpin Button (only for earned badges when user is owner) */}
      {canPin && isEarned && (
        <button
          className={`badge-card-pin-btn ${isPinned ? 'badge-card-pin-btn-active' : ''}`}
          onClick={handlePinClick}
          title={isPinned ? 'Unpin badge' : 'Pin badge to profile'}
        >
          <i className={`fa-solid fa-thumbtack ${isPinned ? '' : 'fa-rotate-90'}`}></i>
        </button>
      )}
    </div>
  );
}

export default BadgeCard;
