import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { publicUserApi } from '../../services/profile';
import usePinnedBadges from '../../hooks/usePinnedBadges';
import { mapBadgeIdsToBadges } from '../../utils/badges';
import ProfileHeader from '../../components/profile/ProfileHeader';
import ProfileStats from '../../components/profile/ProfileStats';
import BadgeSection from '../../components/badges/BadgeSection';
import Alert from '../../components/shared/Alert';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

/**
 * PublicProfilePage Component
 *
 * Displays a public profile for any user by username.
 * Shows profile header, badges (expandable), stats, and user's reviews.
 * If viewing your own profile, shows "Edit Profile" button.
 */
function PublicProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profileUser, setProfileUser] = useState(null);
  const [badges, setBadges] = useState([]);
  const [pinnedBadges, setPinnedBadges] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [badgesVisible, setBadgesVisible] = useState(false);

  // Check if viewing own profile
  const isOwnProfile = currentUser?.username === username;

  // Use pinned badges hook (don't auto-fetch, we get data from API)
  const { updatePinnedBadgeIds } = usePinnedBadges(false);

  // Toggle badges visibility
  const handleToggleBadges = () => {
    setBadgesVisible(!badgesVisible);
  };

  // Handle follow/unfollow - update stats in real-time
  const handleFollowChange = (delta) => {
    setProfileUser(prev => ({
      ...prev,
      is_following: delta > 0, // true if followed, false if unfollowed
      stats: {
        ...prev.stats,
        follower_count: (prev.stats?.follower_count || 0) + delta
      }
    }));
  };

  // Fetch user profile and badges
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError('');

      try {
        const [profileResponse, badgesResponse] = await Promise.all([
          publicUserApi.getUser(username),
          publicUserApi.getUserBadges(username)
        ]);

        setProfileUser(profileResponse.data);
        const earnedBadges = badgesResponse.data.earned || [];
        const pinnedBadgeIds = badgesResponse.data.pinned_badge_ids || [];

        setBadges(earnedBadges);

        // Map pinned badge IDs to full badge objects using utility function
        const pinned = mapBadgeIdsToBadges(pinnedBadgeIds, earnedBadges);
        setPinnedBadges(pinned);

        // Update hook with pinned badge IDs (for own profile only)
        if (isOwnProfile) {
          updatePinnedBadgeIds(pinnedBadgeIds);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        if (err.response?.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]); // Only re-fetch when username changes

  // Fetch user reviews
  useEffect(() => {
    const fetchReviews = async () => {
      setReviewsLoading(true);

      try {
        const response = await publicUserApi.getUserReviews(username, page);

        if (page === 1) {
          setReviews(response.data.results || []);
        } else {
          setReviews(prev => [...prev, ...(response.data.results || [])]);
        }

        // Check if there are more pages
        setHasMore(!!response.data.next);
      } catch (err) {
        console.error('Error fetching reviews:', err);
      } finally {
        setReviewsLoading(false);
      }
    };

    // Only fetch if profileUser exists - prevents extra calls
    if (profileUser?.id) {
      fetchReviews();
    }
    // Don't include profileUser in dependencies, only its ID to prevent re-fetching
  }, [username, profileUser?.id, page]);

  // Loading state
  if (loading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  // Error state
  if (error) {
    return (
      <div className="public-profile-page">
        <div className="public-profile-container">
          <Alert type="error" message={error} />
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button className="btn-secondary" onClick={() => navigate('/')}>
              <i className="fa-solid fa-home"></i>
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public-profile-page">
      <div className="public-profile-container">
        {/* Profile Header */}
        <ProfileHeader
          user={profileUser}
          isOwnProfile={isOwnProfile}
          onShowBadgesClick={handleToggleBadges}
          badgesVisible={badgesVisible}
          pinnedBadges={pinnedBadges}
          onFollowChange={handleFollowChange}
        />

        {/* Badge Section */}
        <BadgeSection badges={badges} alwaysExpanded={true} isVisible={badgesVisible} />

        {/* Profile Stats */}
        {profileUser?.stats && <ProfileStats stats={profileUser.stats} />}

        {/* Reviews Section */}
        <div className="public-profile-reviews">
          <h2 className="section-title">
            <i className="fa-solid fa-star"></i>
            Reviews by {profileUser?.username}
          </h2>

          {reviews.length === 0 && !reviewsLoading ? (
            <div className="empty-state">
              <i className="fa-solid fa-star"></i>
              <p>No reviews yet</p>
              <p style={{ fontSize: 'var(--text-sm)', marginTop: '8px', color: 'var(--text-muted)' }}>
                {isOwnProfile
                  ? "You haven't reviewed any locations yet. Start exploring!"
                  : `${profileUser?.username} hasn't reviewed any locations yet.`
                }
              </p>
            </div>
          ) : (
            <>
              <div className="reviews-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-card">
                    {/* Location Name */}
                    <div className="review-header">
                      <h3 className="review-location-name">
                        <a href={`/locations/${review.location?.id}`}>
                          {review.location?.name}
                        </a>
                      </h3>
                      <div className="review-rating">
                        {[...Array(5)].map((_, index) => (
                          <i
                            key={index}
                            className={`fa-solid fa-star ${
                              index < review.rating ? 'star-filled' : 'star-empty'
                            }`}
                          ></i>
                        ))}
                      </div>
                    </div>

                    {/* Review Content */}
                    {review.content && (
                      <p className="review-content">{review.content}</p>
                    )}

                    {/* Review Metadata */}
                    <div className="review-metadata">
                      <span>
                        <i className="fa-solid fa-calendar"></i>
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                      {review.upvote_count > 0 && (
                        <span>
                          <i className="fa-solid fa-thumbs-up"></i>
                          {review.upvote_count} helpful
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 'var(--spacing-lg)' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={reviewsLoading}
                  >
                    {reviewsLoading ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        Loading...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-chevron-down"></i>
                        Load More Reviews
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PublicProfilePage;
