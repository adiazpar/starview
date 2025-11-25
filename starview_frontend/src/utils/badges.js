/**
 * Badge utility functions
 * Shared logic for badge operations across components
 */

/**
 * Map badge IDs to full badge objects from an earned badges array
 * @param {number[]} badgeIds - Array of badge IDs to map
 * @param {Array} earnedBadges - Array of earned badge objects
 * @returns {Array} Array of full badge objects matching the IDs, preserving order
 */
export function mapBadgeIdsToBadges(badgeIds, earnedBadges) {
  return badgeIds
    .map(id => earnedBadges.find(badge => badge.badge_id === id))
    .filter(badge => badge !== undefined);
}
