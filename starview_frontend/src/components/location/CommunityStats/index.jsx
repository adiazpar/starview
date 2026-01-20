/* CommunityStats Component
 * Displays visits, saves, rating, and creator attribution.
 */

import { Link } from 'react-router-dom';
import './styles.css';

// Simple relative time formatter
function formatRelativeTime(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
}

function CommunityStats({ location }) {
  const rating = parseFloat(location.average_rating) || 0;
  const reviewCount = location.review_count || 0;
  const visitorCount = location.visitor_count || 0;

  // Format when the location was created
  const createdAt = formatRelativeTime(location.created_at);

  return (
    <div className="community-stats glass-card">
      <div className="community-stats__header">
        <span>Community</span>
      </div>

      {/* Stats Row */}
      <div className="community-stats__row">
        <div className="community-stats__stat">
          <span className="community-stats__value">{visitorCount}</span>
          <span className="community-stats__label">visits</span>
        </div>

        <div className="community-stats__divider" />

        <div className="community-stats__stat">
          <span className="community-stats__value">{reviewCount}</span>
          <span className="community-stats__label">reviews</span>
        </div>

        <div className="community-stats__divider" />

        <div className="community-stats__stat">
          <span className="community-stats__value">
            {reviewCount > 0 ? (
              <>
                <i className="fa-solid fa-star"></i>
                {rating.toFixed(1)}
              </>
            ) : (
              '—'
            )}
          </span>
          <span className="community-stats__label">rating</span>
        </div>
      </div>

      {/* Creator Attribution */}
      {location.added_by && (
        <div className="community-stats__creator">
          <span className="community-stats__creator-label">Added by</span>
          <Link
            to={`/users/${location.added_by.username}`}
            className="community-stats__creator-link"
          >
            @{location.added_by.username}
          </Link>
          {createdAt && (
            <span className="community-stats__creator-date">{createdAt}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default CommunityStats;
