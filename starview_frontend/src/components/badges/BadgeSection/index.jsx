import React, { useState } from 'react';
import BadgeCompact from '../BadgeCompact';
import BadgeModal from '../BadgeModal';
import './styles.css';

/**
 * BadgeSection - Section displaying earned badges
 *
 * Displays badges with smooth expand/collapse animation.
 * Clicking a badge opens a modal with full details.
 *
 * Designed for public user profiles.
 *
 * Props:
 * - badges: Array of badge objects (earned badges only)
 *   Each badge should have: { badge_id, name, slug, icon_path, tier, is_rare, category, earned_at }
 * - alwaysExpanded: If true, badges are always visible without toggle (default: false)
 * - isVisible: Boolean to control expand/collapse animation (default: true)
 */
function BadgeSection({ badges = [], alwaysExpanded = false, isVisible = true }) {
  const [selectedBadge, setSelectedBadge] = useState(null);

  const handleBadgeClick = (badge) => {
    setSelectedBadge(badge);
  };

  const handleCloseModal = () => {
    setSelectedBadge(null);
  };

  const badgeCount = badges.length;

  return (
    <div className={`badge-section ${!isVisible ? 'collapsed' : ''}`}>
      <div className={`badge-section-content ${!isVisible ? 'collapsing' : ''}`}>
        <div className="badge-section-content-inner glass-card">
          <div className="badge-section-content-padded">
            {badgeCount === 0 ? (
              <div className="empty-state">
                <i className="fa-solid fa-trophy empty-state__icon"></i>
                <p className="empty-state__title">No badges earned yet</p>
              </div>
            ) : (
              <>
                <div className="badge-section-grid">
                  {badges.map((badge) => (
                    <BadgeCompact
                      key={badge.badge_id}
                      badge={{
                        id: badge.badge_id,
                        name: badge.name,
                        slug: badge.slug,
                        icon_path: badge.icon_path,
                        tier: badge.tier,
                        is_rare: badge.is_rare,
                        category: badge.category,
                        description: badge.description
                      }}
                      onClick={() => handleBadgeClick(badge)}
                    />
                  ))}
                </div>
                <p className="badge-section-hint">
                  <i className="fa-solid fa-caret-up"></i>
                  Click any badge to see details
                </p>
              </>
            )}
          </div>
        </div>
      </div>

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
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

export default BadgeSection;
