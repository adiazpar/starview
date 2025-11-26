import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import profileApi from '../../../services/profile';
import Alert from '../../shared/Alert';
import './styles.css';

/**
 * FavoritesTab - User's favorite locations
 *
 * Displays saved locations with ability to remove them
 */
function FavoritesTab() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch favorites on mount
  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await profileApi.getFavorites();
        console.log('Favorites response:', response.data);
        // Handle both array and object responses
        if (Array.isArray(response.data)) {
          setFavorites(response.data);
        } else if (response.data.results) {
          // Paginated response
          setFavorites(response.data.results);
        } else {
          setFavorites([]);
        }
      } catch (err) {
        console.error('Error fetching favorites:', err);
        const errorMessage = err.response?.data?.detail || 'Failed to load favorites';
        setError(errorMessage);
        setFavorites([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, []);

  const handleRemoveFavorite = async (favoriteId, locationName) => {
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(`Remove "${locationName}" from favorites?`)) return;

    try {
      await profileApi.removeFavorite(favoriteId);
      setFavorites(favorites.filter(fav => fav.id !== favoriteId));
      setSuccess('Favorite removed successfully!');
    } catch (err) {
      console.error('Error removing favorite:', err);
      const errorMessage = err.response?.data?.detail || 'Failed to remove favorite';
      setError(errorMessage);
    }
  };

  return (
    <div className="profile-section">
      <h2 className="profile-section-title">My Locations</h2>
      <p className="profile-section-description">
        Your saved stargazing locations
      </p>

      {/* Success/Error Messages */}
      {success && (
        <Alert
          type="success"
          message={success}
          onClose={() => setSuccess('')}
        />
      )}
      {error && (
        <Alert
          type="error"
          message={error}
          onClose={() => setError('')}
        />
      )}

      {loading ? (
        <div className="profile-loading-state">
          <i className="fa-solid fa-spinner fa-spin"></i>
        </div>
      ) : favorites.length === 0 ? (
        <div className="profile-empty-state">
          <i className="fa-solid fa-heart"></i>
          <p>No favorites yet</p>
          <p className="profile-empty-state-description">
            Start exploring locations and save your favorites!
          </p>
        </div>
      ) : (
        <div className="profile-items-grid">
          {favorites.map((favorite) => (
            <div key={favorite.id} className="profile-item-card">
              <div className="favorite-card-header">
                <div className="favorite-card-content">
                  <h3 className="favorite-location-title">
                    {favorite.location?.name || 'Unknown Location'}
                  </h3>

                  {favorite.nickname && (
                    <p className="favorite-nickname">
                      <i className="fa-solid fa-tag"></i> {favorite.nickname}
                    </p>
                  )}

                  <div className="favorite-meta">
                    {favorite.location?.average_rating && (
                      <span>
                        <i className="fa-solid fa-star favorite-star-icon"></i>
                        {' '}{favorite.location.average_rating.toFixed(1)}
                      </span>
                    )}
                    {favorite.location?.review_count !== undefined && (
                      <span>
                        <i className="fa-solid fa-comment"></i>
                        {' '}{favorite.location.review_count} {favorite.location.review_count === 1 ? 'review' : 'reviews'}
                      </span>
                    )}
                  </div>

                  <p className="favorite-date">
                    Added {new Date(favorite.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="favorite-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => navigate(`/locations/${favorite.location?.id}`)}
                  >
                    <i className="fa-solid fa-eye"></i>
                    View
                  </button>
                  <button
                    className="btn btn-sm btn-icon-only"
                    onClick={() => handleRemoveFavorite(favorite.id, favorite.location?.name)}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FavoritesTab;
