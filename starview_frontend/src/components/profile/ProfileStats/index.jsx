import React from 'react';
import './styles.css';

/**
 * ProfileStats Component
 *
 * Displays user statistics in a card grid.
 * Shows follower count, review count, locations reviewed, and helpful votes received.
 *
 * Props:
 * - stats: Object containing user statistics
 *   - follower_count: Number of followers
 *   - review_count: Number of reviews written
 *   - locations_reviewed: Number of unique locations reviewed
 *   - helpful_votes_received: Number of helpful votes received on reviews
 */
function ProfileStats({ stats }) {
  if (!stats) return null;

  const statItems = [
    {
      icon: 'fa-users',
      label: 'Followers',
      value: stats.follower_count || 0,
      color: '#8b5cf6'
    },
    {
      icon: 'fa-star',
      label: 'Reviews',
      value: stats.review_count || 0,
      color: '#f59e0b'
    },
    {
      icon: 'fa-map-marker-alt',
      label: 'Locations',
      value: stats.locations_reviewed || 0,
      color: '#3b82f6'
    },
    {
      icon: 'fa-thumbs-up',
      label: 'Helpful Votes',
      value: stats.helpful_votes_received || 0,
      color: '#10b981'
    }
  ];

  return (
    <div className="profile-stats">
      <div className="profile-stats-grid">
        {statItems.map((item, index) => (
          <div key={index} className="profile-stat-card glass-card glass-card--interactive">
            <div className="profile-stat-icon" style={{ color: item.color }}>
              <i className={`fa-solid ${item.icon}`}></i>
            </div>
            <div className="profile-stat-info">
              <div className="profile-stat-value">{item.value}</div>
              <div className="profile-stat-label">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProfileStats;
