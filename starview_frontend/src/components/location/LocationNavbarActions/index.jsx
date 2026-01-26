/* LocationNavbarActions Component
 * Action buttons displayed in the navbar extension when scrolling
 * past the location hero section. Matches LocationHero button styles.
 */

import './styles.css';

function LocationNavbarActions({
  locationName,
  locationAddress,
  isFavorited,
  isVisited,
  isMarkingVisited,
  onBack,
  onFavorite,
  onMarkVisited,
  onShare,
}) {
  return (
    <div className="location-navbar-actions">
      <button
        className="location-navbar-actions__back"
        onClick={onBack}
        aria-label="Go back"
      >
        <i className="fa-solid fa-arrow-left"></i>
        <span className="location-navbar-actions__back-text">Back</span>
      </button>

      <div className="location-navbar-actions__info">
        <h2 className="location-navbar-actions__name">{locationName}</h2>
        {locationAddress && (
          <p className="location-navbar-actions__address">{locationAddress}</p>
        )}
      </div>

      <div className="location-navbar-actions__buttons">
        <button
          className={`location-navbar-actions__action ${isFavorited ? 'location-navbar-actions__action--active' : ''}`}
          onClick={onFavorite}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <i className={`fa-${isFavorited ? 'solid' : 'regular'} fa-heart`}></i>
          <span className="location-navbar-actions__action-text">
            {isFavorited ? 'Saved' : 'Save'}
          </span>
        </button>
        <button
          className={`location-navbar-actions__action ${isVisited ? 'location-navbar-actions__action--visited' : ''}`}
          onClick={onMarkVisited}
          disabled={isMarkingVisited}
          aria-label={isVisited ? 'Remove visit' : 'Mark as visited'}
        >
          {isMarkingVisited ? (
            <i className="fa-solid fa-spinner fa-spin"></i>
          ) : (
            <i className="fa-solid fa-map-pin"></i>
          )}
          <span className="location-navbar-actions__action-text">Visited</span>
        </button>
        <button
          className="location-navbar-actions__action"
          onClick={onShare}
          aria-label="Share location"
        >
          <i className="fa-solid fa-share"></i>
          <span className="location-navbar-actions__action-text">Share</span>
        </button>
      </div>
    </div>
  );
}

export default LocationNavbarActions;
