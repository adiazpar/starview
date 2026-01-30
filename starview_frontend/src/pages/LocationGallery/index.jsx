/* LocationGallery Page
 * Displays all photos for a location with cursor-based pagination.
 * Header adapted from LocationHero without image carousel or action buttons.
 * Uses shared photo components for grid items and lightbox modal.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useState, useRef, useEffect } from 'react';
import { RowsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/rows.css';
import { useLocation } from '../../hooks/useLocations';
import { useLocationPhotos } from '../../hooks/useLocationPhotos';
import { usePhotoVote } from '../../hooks/usePhotoVote';
import useRequireAuth from '../../hooks/useRequireAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useSEO } from '../../hooks/useSEO';
import { PhotoItem, PhotoLightbox, PhotoUploadModal } from '../../components/shared/photo';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most_upvoted', label: 'Most Upvoted' },
  { value: 'mine', label: 'My Photos', requiresAuth: true },
];

const PAGE_SIZE = 24;

function LocationGalleryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, isLoading, isError, error } = useLocation(id);

  // Sort state
  const [sort, setSort] = useState('newest');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortRef = useRef(null);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Auth and voting
  const { requireAuth } = useRequireAuth();
  const { user } = useAuth();
  const { mutate: toggleVote, isPending: isVoting } = usePhotoVote(id);

  // Determine if filtering to user's photos only
  const mineOnly = sort === 'mine';
  // When showing "My Photos", sort by newest; otherwise use selected sort
  const actualSort = mineOnly ? 'newest' : sort;

  // Fetch photos with pagination
  const {
    photos,
    totalCount,
    hasNextPage,
    isLoading: photosLoading,
    isFetchingNextPage,
    fetchNextPage,
  } = useLocationPhotos(id, actualSort, PAGE_SIZE, mineOnly);

  // Transform API response to match expected format for both lightbox and photo album
  // react-photo-album requires: src, width, height
  // Default to 4:3 aspect ratio if dimensions are missing
  const DEFAULT_WIDTH = 1920;
  const DEFAULT_HEIGHT = 1440;

  const transformedPhotos = photos.map((photo, index) => ({
    // Lightbox data
    id: photo.id,
    full: photo.image_url,
    thumbnail: photo.thumbnail_url || photo.image_url,
    uploaded_at: photo.created_at,
    upvote_count: photo.upvote_count,
    user_has_upvoted: photo.user_has_upvoted,
    uploaded_by: photo.uploaded_by ? {
      username: photo.uploaded_by.username,
      display_name: photo.uploaded_by.display_name || photo.uploaded_by.username,
      profile_picture: photo.uploaded_by.profile_picture_url,
      is_system_account: photo.uploaded_by.is_system_account || false,
    } : null,
    // react-photo-album required fields
    src: photo.thumbnail_url || photo.image_url,
    width: photo.width || DEFAULT_WIDTH,
    height: photo.height || DEFAULT_HEIGHT,
    // Track original index for lightbox
    index,
  }));

  const currentPhoto = lightboxIndex !== null ? transformedPhotos[lightboxIndex] : null;

  // Close sort dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set SEO meta tags
  useSEO({
    title: location ? `Photos of ${location.name} | Starview` : 'Photos | Starview',
    description: location
      ? `Browse photos of ${location.name} in ${location.administrative_area || location.country || 'unknown location'}.`
      : 'Browse photos of this stargazing location on Starview.',
    path: `/locations/${id}/photos`,
  });

  // Handle back navigation
  const handleBack = useCallback(() => {
    // Go back in history, or fallback to location detail if no history
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(`/locations/${id}`);
    }
  }, [navigate, id]);

  // Handle sort change
  const handleSortChange = useCallback((newSort) => {
    setSort(newSort);
    setSortDropdownOpen(false);
  }, []);

  // Lightbox handlers
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

  // Handle upload button click
  const handleUploadClick = useCallback(() => {
    if (!requireAuth()) return;
    setIsUploadModalOpen(true);
  }, [requireAuth]);

  // Get current sort label
  const currentSortLabel = SORT_OPTIONS.find((opt) => opt.value === sort)?.label || 'Newest';

  // Build region string
  const region = location
    ? [location.locality, location.administrative_area, location.country]
        .filter(Boolean)
        .join(', ')
    : '';

  // Loading state - fills viewport to prevent layout jump
  if (isLoading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  // Error state
  if (isError) {
    return (
      <div className="location-gallery location-gallery--error">
        <div className="location-gallery__error-content">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <h3>Location Not Found</h3>
          <p>{error?.message || 'This location may have been removed or does not exist.'}</p>
        </div>
      </div>
    );
  }

  // No location found
  if (!location) {
    return null;
  }

  return (
    <div className="location-gallery">
      {/* Header Section */}
      <header className="location-gallery__header">
        {/* Navigation Bar */}
        <nav className="location-gallery__nav">
          <button
            className="location-gallery__back"
            onClick={handleBack}
            aria-label="Go back to location"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span className="location-gallery__back-text">Back</span>
          </button>
        </nav>

        {/* Location Info */}
        <div className="location-gallery__info">
          <h1 className="location-gallery__title">Photos of {location.name}</h1>

          {region && (
            <p className="location-gallery__region">{region}</p>
          )}

          {/* Rating */}
          <div className="location-gallery__stats">
            {location.average_rating > 0 ? (
              <span className="location-gallery__stat">
                <i className="fa-solid fa-star"></i>
                {parseFloat(location.average_rating).toFixed(1)}
                <span className="location-gallery__stat-label">
                  ({location.review_count} {location.review_count === 1 ? 'review' : 'reviews'})
                </span>
              </span>
            ) : (
              <span className="location-gallery__stat location-gallery__stat--muted">
                <i className="fa-regular fa-star"></i>
                <span className="location-gallery__stat-label">No reviews yet</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="location-gallery__toolbar">
        <button className="location-gallery__upload" onClick={handleUploadClick}>
          Upload Photo
        </button>

        {/* Sort Dropdown */}
        <div className="location-gallery__sort-wrapper" ref={sortRef}>
          <button
            className="location-gallery__sort"
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            aria-haspopup="listbox"
            aria-expanded={sortDropdownOpen}
          >
            <i className="fa-solid fa-sort"></i>
            <span>{currentSortLabel}</span>
            <i className="fa-solid fa-chevron-down"></i>
          </button>

          {sortDropdownOpen && (
            <ul className="location-gallery__sort-menu" role="listbox">
              {SORT_OPTIONS
                .filter((option) => !option.requiresAuth || user)
                .map((option) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={sort === option.value}
                    className={`location-gallery__sort-option ${sort === option.value ? 'location-gallery__sort-option--active' : ''}`}
                    onClick={() => handleSortChange(option.value)}
                  >
                    {option.label}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="location-gallery__content">
        {photosLoading ? (
          <div className="location-gallery__loading">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <span>Loading photos...</span>
          </div>
        ) : transformedPhotos.length === 0 ? (
          <div className="location-gallery__empty">
            <i className="fa-regular fa-image"></i>
            <h3>{mineOnly ? 'No photos uploaded' : 'No photos yet'}</h3>
            <p>
              {mineOnly
                ? "You haven't uploaded any photos to this location yet"
                : `Be the first to share a photo of ${location.name}`}
            </p>
          </div>
        ) : transformedPhotos.length < 3 ? (
          /* Simple grid for 1-2 photos to avoid oversized display */
          <div className="location-gallery__sparse-grid">
            {transformedPhotos.map((photo) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                locationName={location.name}
                index={photo.index}
                totalCount={totalCount}
                onClick={openLightbox}
                className="photo-item--sparse"
                style={{ '--photo-index': photo.index % PAGE_SIZE }}
                showVoteCount
              />
            ))}
          </div>
        ) : (
          <RowsPhotoAlbum
            photos={transformedPhotos}
            targetRowHeight={200}
            rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
            spacing={8}
            render={{
              image: (props, { photo, width, height }) => (
                <PhotoItem
                  photo={photo}
                  locationName={location.name}
                  index={photo.index}
                  totalCount={totalCount}
                  onClick={openLightbox}
                  style={{ '--photo-index': photo.index % PAGE_SIZE }}
                  width={width}
                  height={height}
                  imgProps={props}
                  showVoteCount
                />
              ),
            }}
          />
        )}
      </div>

      {/* Footer with pagination info */}
      <footer className="location-gallery__footer">
        {hasNextPage && (
          <button
            className="location-gallery__see-more"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'SEE MORE PHOTOS'}
          </button>
        )}
        <span>
          Showing results {transformedPhotos.length > 0 ? 1 : 0} - {transformedPhotos.length} of {totalCount}
        </span>
      </footer>

      {/* Lightbox */}
      {lightboxIndex !== null && currentPhoto && (
        <PhotoLightbox
          photo={currentPhoto}
          locationName={location.name}
          isClosing={isClosing}
          onClose={closeLightbox}
          onVote={handleVote}
          isVoting={isVoting}
          isOwnPhoto={user?.username === currentPhoto.uploaded_by?.username}
        />
      )}

      {/* Upload Modal */}
      <PhotoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        locationId={id}
      />
    </div>
  );
}

export default LocationGalleryPage;
