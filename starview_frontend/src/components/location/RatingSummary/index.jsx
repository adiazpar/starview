/* RatingSummary Component
 * Displays prominent rating with distribution breakdown.
 * Observatory aesthetic with technical gauge visualization.
 */

import './styles.css';

function RatingSummary({ location }) {
  const rating = parseFloat(location.average_rating) || 0;
  const reviewCount = location.review_count || 0;
  const reviews = location.reviews || [];

  // Calculate rating distribution from reviews
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(review => {
    const r = Math.round(review.rating);
    if (r >= 1 && r <= 5) {
      distribution[r]++;
    }
  });

  // Find max for scaling bars
  const maxCount = Math.max(...Object.values(distribution), 1);

  // No reviews state
  if (reviewCount === 0) {
    return (
      <div className="rating-summary glass-card">
        <div className="rating-summary__empty">
          <div className="rating-summary__empty-icon">
            <i className="fa-regular fa-star"></i>
          </div>
          <p className="rating-summary__empty-title">No reviews yet</p>
          <p className="rating-summary__empty-text">
            Be the first to share your experience at this location
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rating-summary glass-card">
      <div className="rating-summary__header">
        <span>Community Rating</span>
      </div>

      <div className="rating-summary__content">
        {/* Large Rating Display */}
        <div className="rating-summary__score">
          <span className="rating-summary__number">{rating.toFixed(1)}</span>
          <div className="rating-summary__stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <i
                key={star}
                className={`fa-${star <= Math.round(rating) ? 'solid' : 'regular'} fa-star`}
              ></i>
            ))}
          </div>
          <span className="rating-summary__count">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        {/* Rating Distribution */}
        <div className="rating-summary__distribution">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = distribution[stars];
            const percentage = (count / maxCount) * 100;

            return (
              <div key={stars} className="rating-summary__bar-row">
                <span className="rating-summary__bar-label">{stars}</span>
                <div className="rating-summary__bar-track">
                  <div
                    className="rating-summary__bar-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="rating-summary__bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default RatingSummary;
