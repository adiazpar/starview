/* PhotoMosaic Component
 * Asymmetric photo grid that feels editorial, not generic carousel.
 * Click to open lightbox. Hover shows photographer attribution.
 * Photos sorted by upvotes - users can vote in lightbox.
 * Fetches photos from dedicated endpoint for consistency with gallery page.
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useRequireAuth from '../../../hooks/useRequireAuth';
import { useAuth } from '../../../contexts/AuthContext';
import { usePhotoVote } from '../../../hooks/usePhotoVote';
import { useLocationPhotos } from '../../../hooks/useLocationPhotos';
import { PhotoLightbox } from '../../shared/photo';
import './styles.css';

function PhotoMosaic({ locationName, locationId }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const { requireAuth } = useRequireAuth();
  const { user } = useAuth();
  const { mutate: toggleVote, isPending: isVoting } = usePhotoVote(locationId);

  // Fetch photos from dedicated endpoint (same as gallery page)
  const { photos, totalCount, isLoading } = useLocationPhotos(
    locationId,
    'most_upvoted',
    5
  );

  // Transform API response to match expected format
  const images = photos.map((photo) => ({
    id: photo.id,
    thumbnail: photo.thumbnail_url,
    full: photo.image_url,
    uploaded_at: photo.created_at,
    upvote_count: photo.upvote_count,
    user_has_upvoted: photo.user_has_upvoted,
    uploaded_by: photo.uploaded_by ? {
      username: photo.uploaded_by.username,
      display_name: photo.uploaded_by.display_name,
      profile_picture: photo.uploaded_by.profile_picture_url,
      is_system_account: photo.uploaded_by.is_system_account,
    } : null,
  }));

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    setIsClosing(false);
  }, []);

  const closeLightbox = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    // Wait for fade-out animation to complete
    setTimeout(() => {
      setLightboxIndex(null);
      setIsClosing(false);
      // Clear any lingering hover/focus state on mobile
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 200); // Match --animation-duration (0.2s)
  }, [isClosing]);

  const handleVote = useCallback((photoId) => {
    if (!requireAuth()) return;
    if (isVoting) return;
    toggleVote(photoId);
  }, [requireAuth, isVoting, toggleVote]);

  // Don't render while loading or if no photos
  if (isLoading || images.length === 0) return null;

  // Show up to 5 images in mosaic
  const visibleImages = images.slice(0, 5);
  const remainingCount = totalCount - visibleImages.length;

  const currentImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  // Format photo count with threshold (show "99+" for 100+ photos)
  const PHOTO_COUNT_THRESHOLD = 99;
  const photoCountDisplay = totalCount > PHOTO_COUNT_THRESHOLD
    ? `${PHOTO_COUNT_THRESHOLD}+`
    : totalCount;

  return (
    <div className="photo-mosaic">
      {/* Section Header */}
      <div className="photo-mosaic__header">
        <span>Photos ({photoCountDisplay})</span>
      </div>

      {/* Mosaic Grid */}
      <div className={`photo-mosaic__grid photo-mosaic__grid--${Math.min(visibleImages.length, 5)}`}>
        {visibleImages.map((image, index) => (
          <button
            key={image.id}
            className={`photo-mosaic__item photo-mosaic__item--${index + 1}`}
            onClick={() => openLightbox(index)}
            aria-label={`View photo ${index + 1} of ${totalCount}${image.uploaded_by ? ` by ${image.uploaded_by.display_name}` : ''}`}
          >
            <img
              src={image.full || image.thumbnail}
              alt={`${locationName} photo ${index + 1}`}
              loading="lazy"
            />

            {/* Hover Overlay with User Attribution */}
            {image.uploaded_by && (
              <div className="photo-mosaic__overlay">
                <div className="photo-mosaic__attribution">
                  <img
                    src={image.uploaded_by.profile_picture}
                    alt=""
                    className="photo-mosaic__avatar"
                  />
                  <div className="photo-mosaic__user-info">
                    <span className="photo-mosaic__username">@{image.uploaded_by.username}</span>
                    <span className="photo-mosaic__display-name">{image.uploaded_by.display_name}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Show remaining count on last visible image */}
            {index === visibleImages.length - 1 && remainingCount > 0 && (
              <div className="photo-mosaic__more">
                <span>+{remainingCount}</span>
              </div>
            )}
          </button>
        ))}

        {/* See All Photos Card (Mobile only) */}
        <Link to={`/locations/${locationId}/photos`} className="photo-mosaic__item photo-mosaic__item--see-all">
          <span>See all photos</span>
        </Link>
      </div>

      {/* See All Photos Link (Desktop only) */}
      <div className="photo-mosaic__footer">
        <Link to={`/locations/${locationId}/photos`} className="photo-mosaic__link">
          See all photos
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && currentImage && (
        <PhotoLightbox
          photo={currentImage}
          locationName={locationName}
          isClosing={isClosing}
          onClose={closeLightbox}
          onVote={locationId ? handleVote : null}
          isVoting={isVoting}
          isOwnPhoto={user?.username === currentImage.uploaded_by?.username}
        />
      )}
    </div>
  );
}

export default PhotoMosaic;
