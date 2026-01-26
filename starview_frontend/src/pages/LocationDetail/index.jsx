/* LocationDetail Page
 * Central hub for viewing a single stargazing location.
 * Observatory control room aesthetic with editorial asymmetry.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useToggleFavorite, useToggleVisited } from '../../hooks/useLocations';
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
import './styles.css';

function LocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, isLoading, isError, error } = useLocation(id);
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

  // Loading state - return empty container with min-height to prevent layout shift
  if (isLoading) {
    return <div className="location-detail location-detail--loading" />;
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
        onBack={handleBack}
        isFavorited={isFavorited}
        isVisited={isVisited}
        onFavorite={handleFavorite}
        onMarkVisited={handleMarkVisited}
        onShare={handleShare}
      />

      {/* Main Content */}
      <div className="location-detail__content">
        {/* Desktop: Two-column layout */}
        <div className="location-detail__main">
          {/* About Section - Stats + Description */}
          <section className="location-detail__about">
            <div className="location-detail__section-header">
              <span>About this Location</span>
            </div>
            <LocationStats location={location} />
            <LocationAbout location={location} />
          </section>

          {/* Sky Quality Dashboard - Mobile only (desktop shows in sidebar) */}
          <div className="location-detail__sky-quality--mobile">
            <SkyQualityPanel
              bortle={location.bortle_class}
              sqm={location.bortle_sqm}
              elevation={location.elevation}
            />
          </div>

          {/* Photo Gallery */}
          {location.images?.length > 0 && (
            <div id="photo-gallery">
              <PhotoMosaic images={location.images} locationName={location.name} />
            </div>
          )}

          {/* Map Section - Mobile only */}
          <div className="location-detail__map--mobile">
            <LocationMap location={location} />
          </div>

          {/* Community Stats - Mobile only */}
          <div className="location-detail__community--mobile">
            <CommunityStats location={location} />
          </div>

          {/* Rating Summary */}
          <RatingSummary location={location} />

          {/* Reviews Section */}
          <ReviewSection locationId={location.id} reviews={location.reviews} />
        </div>

        {/* Desktop Sidebar - Sticky */}
        <aside className="location-detail__sidebar">
          {/* Sky Quality Panel */}
          <SkyQualityPanel
            bortle={location.bortle_class}
            sqm={location.bortle_sqm}
            elevation={location.elevation}
          />

          {/* Community Stats */}
          <CommunityStats location={location} />

          {/* Mini Map */}
          <LocationMap location={location} compact />
        </aside>
      </div>
    </div>
  );
}

export default LocationDetailPage;
