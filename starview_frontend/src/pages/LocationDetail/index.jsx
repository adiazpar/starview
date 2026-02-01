/* LocationDetail Page
 * Central hub for viewing a single stargazing location.
 * Observatory control room aesthetic with editorial asymmetry.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useToggleFavorite, useToggleVisited } from '../../hooks/useLocations';
import { useLocationPhotos } from '../../hooks/useLocationPhotos';
import { useSEO } from '../../hooks/useSEO';
import { useNavbarExtension } from '../../contexts/NavbarExtensionContext';
import { useToast } from '../../contexts/ToastContext';
import useRequireAuth from '../../hooks/useRequireAuth';
import LocationHero from '../../components/location/LocationHero';
import LocationStats from '../../components/location/LocationStats';
import SkyQualityPanel from '../../components/location/SkyQualityPanel';
import LocationAbout from '../../components/location/LocationAbout';
import PhotoMosaic from '../../components/location/PhotoMosaic';
import CommunityStats from '../../components/location/CommunityStats';
import LocationMap from '../../components/location/LocationMap';
import ReviewSection from '../../components/location/ReviewSection';
import RatingSummary from '../../components/location/RatingSummary';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './styles.css';

function LocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, isLoading: locationLoading, isError, error } = useLocation(id);

  // Fetch hero photos (top 5 most upvoted) - shares cache with PhotoMosaic via React Query
  const { photos: heroPhotos, isLoading: photosLoading } = useLocationPhotos(id, 'most_upvoted', 5);

  // Combined loading state - wait for both location AND photos before rendering
  const isLoading = locationLoading || photosLoading;
  const { setLocationExtension, updateLocationExtension, setExtensionVisible } = useNavbarExtension();
  const { showToast } = useToast();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const toggleVisited = useToggleVisited();
  const heroRef = useRef(null);

  // Derive state from location cache (updated optimistically by hooks)
  const isFavorited = location?.is_favorited || false;
  const isVisited = location?.is_visited || false;

  // Set SEO meta tags
  useSEO({
    title: location ? `${location.name} | Starview` : 'Location | Starview',
    description: location
      ? `Explore ${location.name} - a ${location.location_type_display || 'stargazing location'} in ${location.administrative_area || location.country || 'unknown location'}. Bortle class ${location.bortle_class || 'N/A'}.`
      : 'Discover this stargazing location on Starview.',
    path: `/locations/${id}`,
  });

  // Handle badge notifications when visiting a location
  useEffect(() => {
    if (toggleVisited.isSuccess && toggleVisited.data?.newly_earned_badges?.length > 0) {
      toggleVisited.data.newly_earned_badges.forEach((badge) => {
        showToast(`Badge earned: ${badge.name}!`, 'success');
      });
    }
  }, [toggleVisited.isSuccess, toggleVisited.data, showToast]);

  // Handle visited toggle errors
  useEffect(() => {
    if (toggleVisited.isError) {
      showToast('Failed to update visit status', 'error');
    }
  }, [toggleVisited.isError, showToast]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/explore');
    }
  }, [navigate]);

  // Handle favorite toggle
  const handleFavorite = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!requireAuth()) return;
    toggleFavorite.mutate(location.id);
  }, [requireAuth, location?.id, toggleFavorite]);

  // Handle mark visited toggle
  const handleMarkVisited = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!requireAuth()) return;
    toggleVisited.mutate(location.id);
  }, [requireAuth, location?.id, toggleVisited]);

  // Handle share
  const handleShare = useCallback(async (e) => {
    if (e) e.stopPropagation();
    const shareData = {
      title: location?.name || 'Stargazing Location',
      text: `Check out ${location?.name || 'this location'} on Starview - a great stargazing spot!`,
      url: window.location.href,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast('Link copied to clipboard', 'success');
        } catch {
          showToast('Failed to share', 'error');
        }
      }
    }
  }, [location?.name, showToast]);

  // Set up intersection observer for hero visibility (controls navbar extension visibility)
  useEffect(() => {
    const heroElement = heroRef.current;
    if (!heroElement || !location) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show navbar extension when hero is NOT intersecting (scrolled past)
        setExtensionVisible(!entry.isIntersecting);
      },
      {
        // Trigger when the bottom of the hero passes the top of the viewport
        rootMargin: '-64px 0px 0px 0px', // Account for navbar height
        threshold: 0,
      }
    );

    observer.observe(heroElement);

    return () => {
      observer.disconnect();
    };
  }, [location, setExtensionVisible]);

  // Store handlers in refs to avoid infinite update loops
  const handlersRef = useRef({ handleBack, handleFavorite, handleMarkVisited, handleShare });
  handlersRef.current = { handleBack, handleFavorite, handleMarkVisited, handleShare };

  // Create stable callbacks that read from refs
  const stableHandlers = useMemo(() => ({
    onBack: (e) => handlersRef.current.handleBack(e),
    onFavorite: (e) => handlersRef.current.handleFavorite(e),
    onMarkVisited: (e) => handlersRef.current.handleMarkVisited(e),
    onShare: (e) => handlersRef.current.handleShare(e),
  }), []);

  // Set navbar extension data once when location loads
  useEffect(() => {
    if (!location) return;

    // Build formatted address
    const address = [location.locality, location.administrative_area, location.country]
      .filter(Boolean)
      .join(', ');

    setLocationExtension({
      locationId: location.id,
      locationName: location.name,
      locationAddress: address,
      isFavorited,
      isVisited,
      ...stableHandlers,
    });

    return () => {
      setLocationExtension(null);
    };
  }, [location?.id, setLocationExtension, stableHandlers]);

  // Update navbar extension when action states change (without recreating)
  useEffect(() => {
    if (!location) return;

    updateLocationExtension({
      isFavorited,
      isVisited,
    });
  }, [
    location?.id,
    isFavorited,
    isVisited,
    updateLocationExtension,
  ]);

  // Loading state - fills viewport to prevent layout jump
  if (isLoading) {
    return <LoadingSpinner size="lg" fullPage />;
  }

  // Error state
  if (isError) {
    return (
      <div className="location-detail location-detail--error">
        <div className="location-detail__error-content glass-card">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <h2>Location Not Found</h2>
          <p>{error?.message || 'This location may have been removed or does not exist.'}</p>
          <button className="btn-primary" onClick={() => navigate('/explore')}>
            Explore Locations
          </button>
        </div>
      </div>
    );
  }

  // No location found
  if (!location) {
    return null;
  }

  return (
    <div className="location-detail">
      {/* Hero Section with full-bleed image */}
      <LocationHero
        ref={heroRef}
        location={location}
        photos={heroPhotos}
        onBack={handleBack}
        isFavorited={isFavorited}
        isVisited={isVisited}
        onFavorite={handleFavorite}
        onMarkVisited={handleMarkVisited}
        onShare={handleShare}
      />

      {/* Main Content Grid */}
      <div className="location-detail__content">
        {/* Left Column - Main Content */}
        <div className="location-detail__main">
          <section className="location-detail__about">
            <div className="location-detail__section-header">
              <span>About this Location</span>
            </div>
            <LocationStats location={location} />
            <LocationAbout location={location} />
          </section>
        </div>

        {/* Right Column - Desktop Only */}
        <aside className="location-detail__sidebar">
          <LocationMap location={location} />
        </aside>

        {/* Photo Mosaic - fetches its own photos from dedicated endpoint */}
        <div className="location-detail__photos">
          <PhotoMosaic locationName={location.name} locationId={location.id} />
        </div>

        {/* Mobile-only sections */}
        <div className="location-detail__mobile-sections">
          <LocationMap location={location} />

          {/* Mobile action buttons */}
          <div className="location-detail__mobile-actions">
            <button
              className="location-detail__action-btn"
              onClick={() => navigate(`/explore?view=map&focusLocation=${location.id}`)}
            >
              View on Map
            </button>
            <button
              className="location-detail__action-btn"
              onClick={() => navigate(`/tonight?lat=${location.latitude}&lng=${location.longitude}&name=${encodeURIComponent(location.name)}`)}
            >
              Tonight&apos;s Conditions
            </button>
          </div>

          <SkyQualityPanel
            bortle={location.bortle_class}
            sqm={location.bortle_sqm}
            elevation={location.elevation}
          />
          <CommunityStats location={location} />
        </div>

        {/* Reviews - Spans full width */}
        <div className="location-detail__reviews">
          <RatingSummary location={location} />
          <ReviewSection locationId={location.id} reviews={location.reviews} />
        </div>
      </div>
    </div>
  );
}

export default LocationDetailPage;
