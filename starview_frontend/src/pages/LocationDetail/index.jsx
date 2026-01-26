/* LocationDetail Page
 * Central hub for viewing a single stargazing location.
 * Observatory control room aesthetic with editorial asymmetry.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useToggleFavorite } from '../../hooks/useLocations';
import { useSEO } from '../../hooks/useSEO';
import { useNavbarExtension } from '../../contexts/NavbarExtensionContext';
import { useToast } from '../../contexts/ToastContext';
import useRequireAuth from '../../hooks/useRequireAuth';
import { locationsApi } from '../../services/locations';
import LocationHero from '../../components/location/LocationHero';
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
  const queryClient = useQueryClient();
  const { location, isLoading, isError, error } = useLocation(id);
  const { setLocationExtension, updateLocationExtension, setExtensionVisible } = useNavbarExtension();
  const { showToast } = useToast();
  const { requireAuth } = useRequireAuth();
  const toggleFavorite = useToggleFavorite();
  const heroRef = useRef(null);

  // Local visited state (synced from location data)
  const [isVisited, setIsVisited] = useState(false);

  // Sync visited state from location data
  useEffect(() => {
    if (location?.is_visited !== undefined) {
      setIsVisited(location.is_visited);
    }
  }, [location?.is_visited]);

  // Set SEO meta tags
  useSEO({
    title: location ? `${location.name} | Starview` : 'Location | Starview',
    description: location
      ? `Explore ${location.name} - a ${location.location_type_display || 'stargazing location'} in ${location.administrative_area || location.country || 'unknown location'}. Bortle class ${location.bortle_class || 'N/A'}.`
      : 'Discover this stargazing location on Starview.',
    path: `/locations/${id}`,
  });

  // Mark visited mutation
  const markVisitedMutation = useMutation({
    mutationFn: () => locationsApi.markVisited(location.id),
    onSuccess: (response) => {
      setIsVisited(true);
      showToast('Location marked as visited!', 'success');

      // Check for newly earned badges
      if (response.data.newly_earned_badges?.length > 0) {
        const badges = response.data.newly_earned_badges;
        badges.forEach((badge) => {
          showToast(`Badge earned: ${badge.name}!`, 'success');
        });
      }

      // Invalidate location query to refresh data
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      showToast('Failed to mark as visited', 'error');
    },
  });

  // Unmark visited mutation
  const unmarkVisitedMutation = useMutation({
    mutationFn: () => locationsApi.unmarkVisited(location.id),
    onSuccess: () => {
      setIsVisited(false);
      showToast('Visit removed', 'info');
      queryClient.invalidateQueries({ queryKey: ['location', location.id] });
    },
    onError: () => {
      showToast('Failed to remove visit', 'error');
    },
  });

  const isMarkingVisited = markVisitedMutation.isPending || unmarkVisitedMutation.isPending;
  const isFavorited = location?.is_favorited || false;

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
    if (isVisited) {
      unmarkVisitedMutation.mutate();
    } else {
      markVisitedMutation.mutate();
    }
  }, [requireAuth, isVisited, markVisitedMutation, unmarkVisitedMutation]);

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
      isMarkingVisited,
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
      isMarkingVisited,
    });
  }, [
    location?.id,
    isFavorited,
    isVisited,
    isMarkingVisited,
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
        isMarkingVisited={isMarkingVisited}
        onFavorite={handleFavorite}
        onMarkVisited={handleMarkVisited}
        onShare={handleShare}
      />

      {/* Main Content */}
      <div className="location-detail__content">
        {/* Desktop: Two-column layout */}
        <div className="location-detail__main">
          {/* Sky Quality Dashboard - Mobile only (desktop shows in sidebar) */}
          <div className="location-detail__sky-quality--mobile">
            <SkyQualityPanel
              bortle={location.bortle_class}
              sqm={location.bortle_sqm}
              elevation={location.elevation}
            />
          </div>

          {/* About Section */}
          <LocationAbout location={location} />

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
