/* ReviewSection Component
 * Container for reviews with header and list.
 * Reviews are passed from parent (already fetched with location).
 */

import ReviewItem from '../ReviewItem';
import './styles.css';

function ReviewSection({ locationId, reviews = [] }) {
  const reviewCount = reviews.length;

  return (
    <section className="review-section glass-card">
      <div className="review-section__header">
        <span>Reviews{reviewCount > 0 ? ` (${reviewCount})` : ''}</span>
      </div>

      {reviewCount === 0 ? (
        <div className="review-section__empty">
          <i className="fa-regular fa-comment"></i>
          <p className="review-section__empty-title">No reviews yet</p>
          <p className="review-section__empty-text">
            Be the first to share your experience at this location.
          </p>
        </div>
      ) : (
        <div className="review-section__list">
          {reviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              locationId={locationId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default ReviewSection;
