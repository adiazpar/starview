import './styles.css';

/**
 * MyReviewsTab - User's review history
 *
 * Placeholder component - requires backend endpoint
 */
function MyReviewsTab() {
  return (
    <div className="profile-section">
      <h2 className="profile-section-title">My Reviews</h2>
      <p className="profile-section-description">
        View and manage your location reviews
      </p>

      <div className="empty-state">
        <i className="fa-solid fa-star empty-state__icon"></i>
        <p className="empty-state__title">No reviews yet</p>
        <p className="empty-state__description">
          You haven't reviewed any locations yet. Start exploring!
        </p>
      </div>
    </div>
  );
}

export default MyReviewsTab;
