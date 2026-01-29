/* PhotoItem Component
 * Shared photo grid item with hover overlay showing attribution.
 * Used by PhotoMosaic and LocationGallery.
 */

import './PhotoItem.css';

function PhotoItem({
  photo,
  locationName,
  index,
  totalCount,
  onClick,
  className = '',
  showVoteCount = false,
  remainingCount = 0,
  showRemainingOverlay = false,
}) {
  const handleClick = () => {
    if (onClick) onClick(index);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      className={`photo-item ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View photo ${index + 1} of ${totalCount}${photo.uploaded_by ? ` by ${photo.uploaded_by.display_name}` : ''}`}
    >
      <img
        src={photo.thumbnail || photo.full}
        alt={locationName ? `${locationName} photo ${index + 1}` : `Photo ${index + 1}`}
        loading="lazy"
      />

      {/* Hover Overlay with User Attribution */}
      {photo.uploaded_by && (
        <div className="photo-item__overlay">
          <div className="photo-item__attribution">
            <img
              src={photo.uploaded_by.profile_picture}
              alt=""
              className="photo-item__avatar"
            />
            <div className="photo-item__user-info">
              <span className="photo-item__username">@{photo.uploaded_by.username}</span>
              <span className="photo-item__display-name">{photo.uploaded_by.display_name}</span>
            </div>
          </div>
        </div>
      )}

      {/* Vote count badge */}
      {showVoteCount && photo.upvote_count > 0 && (
        <span className="photo-item__votes">
          <i className="fa-solid fa-heart"></i>
          {photo.upvote_count}
        </span>
      )}

      {/* Remaining count overlay (for mosaic "see more" style) */}
      {showRemainingOverlay && remainingCount > 0 && (
        <div className="photo-item__more">
          <span>+{remainingCount}</span>
        </div>
      )}
    </button>
  );
}

export default PhotoItem;
