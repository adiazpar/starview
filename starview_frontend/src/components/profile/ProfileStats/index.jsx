import React from 'react';
import './styles.css';

/**
 * ProfileStats Component
 *
 * Displays user statistics in a card grid.
 * Shows review count, locations reviewed, favorites, and helpful votes received.
 *
 * Props:
 * - stats: Object containing user statistics
 *   - review_count: Number of reviews written
 *   - locations_reviewed: Number of unique locations reviewed
 *   - favorite_count: Number of favorite locations
 *   - helpful_votes_received: Number of helpful votes received on reviews
 */
function ProfileStats({ stats }) {
  if (!stats) return null;

  const statItems = [
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
      icon: 'fa-heart',
      label: 'Favorites',
      value: stats.favorite_count || 0,
      color: '#ef4444'
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
          <div key={index} className="profile-stat-card">
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
