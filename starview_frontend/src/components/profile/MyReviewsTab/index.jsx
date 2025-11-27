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

      <div className="profile-empty-state">
        <i className="fa-solid fa-star"></i>
        <p>No reviews yet</p>
        <p className="profile-empty-state-description">
          You haven't reviewed any locations yet. Start exploring!
        </p>
      </div>
    </div>
  );
}

export default MyReviewsTab;
