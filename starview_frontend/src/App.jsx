import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import LoadingSpinner from './components/shared/LoadingSpinner';
import LocationOnboardingModal from './components/onboarding/LocationOnboardingModal';
import { useAuth } from './context/AuthContext';
import { profileApi } from './services/profile';

// Lazy load all page components for code splitting
const HomePage = lazy(() => import('./pages/Home'));
const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const EmailVerifiedPage = lazy(() => import('./pages/EmailVerified'));
const EmailConfirmErrorPage = lazy(() => import('./pages/EmailConfirmError'));
const SocialAccountExistsPage = lazy(() => import('./pages/SocialAccountExists'));
const PasswordResetRequestPage = lazy(() => import('./pages/PasswordResetRequest'));
const PasswordResetConfirmPage = lazy(() => import('./pages/PasswordResetConfirm'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfile'));
const ExplorePage = lazy(() => import('./pages/Explore'));
const TonightPage = lazy(() => import('./pages/Tonight'));
const SkyPage = lazy(() => import('./pages/Sky'));
const BortlePage = lazy(() => import('./pages/Bortle'));
const MoonPage = lazy(() => import('./pages/Moon'));
const WeatherPage = lazy(() => import('./pages/Weather'));
const PrivacyPage = lazy(() => import('./pages/Privacy'));
const TermsPage = lazy(() => import('./pages/Terms'));
const AccessibilityPage = lazy(() => import('./pages/Accessibility'));
const CCPAPage = lazy(() => import('./pages/CCPA'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function App() {
  const { isAuthenticated, user, loading, refreshAuth } = useAuth();
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Show location onboarding modal for authenticated users without location
  // Delay appearance to let the home page render first for a smoother experience
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      const shouldShowModal = !user.location && !user.location_prompt_dismissed;
      if (shouldShowModal) {
        const timer = setTimeout(() => {
          setShowLocationModal(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, isAuthenticated, user]);

  // Handle save location from modal
  const handleSaveLocation = async (locationData) => {
    try {
      await profileApi.updateLocation(locationData);
      await refreshAuth();
      setShowLocationModal(false);
    } catch (error) {
      console.error('Failed to save location:', error);
      throw error;
    }
  };

  // Handle skip location prompt
  const handleSkipLocation = async () => {
    try {
      await profileApi.dismissLocationPrompt();
      await refreshAuth();
      setShowLocationModal(false);
    } catch (error) {
      console.error('Failed to dismiss location prompt:', error);
    }
  };

  return (
    <main className="main-content">
      {/* Location onboarding modal */}
      <LocationOnboardingModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSave={handleSaveLocation}
        onSkip={handleSkipLocation}
      />

      <Suspense fallback={<LoadingSpinner size="lg" fullPage />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/email-verified" element={<EmailVerifiedPage />} />
          <Route path="/email-confirm-error" element={<EmailConfirmErrorPage />} />
          <Route path="/social-account-exists" element={<SocialAccountExistsPage />} />
          <Route path="/password-reset" element={<PasswordResetRequestPage />} />
          <Route path="/password-reset-confirm/:uidb64/:token" element={<PasswordResetConfirmPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/users/:username" element={<PublicProfilePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/sky" element={<SkyPage />} />
          <Route path="/tonight" element={<TonightPage />} />
          <Route path="/bortle" element={<BortlePage />} />
          <Route path="/moon" element={<MoonPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="/ccpa" element={<CCPAPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </main>
  );
}

export default App;
