import React from 'react';
import './styles.css';

/**
 * PinnedBadges - Compact horizontal display of pinned badges
 *
 * Displays up to 3 pinned badges as small icons in a row.
 * Used in the ProfileHeader to showcase a user's selected badges.
 *
 * Props:
 * - pinnedBadges: Array of badge objects to display (max 3)
 *   Each badge should have: { badge_id, name, slug, icon_path, tier, is_rare }
 * - onBadgeClick: Optional callback when a badge is clicked
 */
function PinnedBadges({ pinnedBadges = [], onBadgeClick }) {
  if (!pinnedBadges || pinnedBadges.length === 0) {
    return null;
  }

  return (
    <div className="pinned-badges">
      {pinnedBadges.map((badge) => (
        <button
          key={badge.badge_id}
          className={`pinned-badge ${badge.is_rare ? 'rare' : ''}`}
          onClick={() => onBadgeClick && onBadgeClick(badge)}
          title={badge.name}
        >
          <img
            src={badge.icon_path}
            alt={badge.name}
            className="pinned-badge-icon"
          />
        </button>
      ))}
    </div>
  );
}

export default PinnedBadges;
