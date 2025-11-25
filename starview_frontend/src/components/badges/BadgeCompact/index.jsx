import React from 'react';
import './styles.css';

/**
 * BadgeCompact - Lightweight badge component for public profiles
 *
 * Shows just the essential info:
 * - Badge icon (48px)
 * - Badge name
 * - Tier-colored border
 *
 * Designed to be displayed in a grid (5-6 per row) and clickable to show full details.
 *
 * Props:
 * - badge: Badge object with { id, name, slug, icon_path, tier, is_rare, category }
 * - onClick: Function to call when badge is clicked (opens modal with full details)
 */
function BadgeCompact({ badge, onClick }) {
  // Determine tier color class (same logic as BadgeCard)
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

  const tierColor = getTierColor();

  return (
    <div
      className={`badge-compact badge-tier-${tierColor}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Badge Icon */}
      <div className="badge-compact-icon-wrapper">
        <img
          src={badge.icon_path}
          alt={badge.name}
          className="badge-compact-icon"
        />
      </div>

      {/* Badge Name */}
      <div className="badge-compact-name">
        {badge.name}
      </div>
    </div>
  );
}

export default BadgeCompact;
