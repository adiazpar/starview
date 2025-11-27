import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/navbar';
import Starfield from './components/starfield';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/shared/LoadingSpinner';

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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Starfield />
        <Navbar />
        <Suspense fallback={<LoadingSpinner size="lg" fullPage />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/email-verified" element={<EmailVerifiedPage />} />
            <Route path="/email-confirm-error" element={<EmailConfirmErrorPage />} />
            <Route path="/social-account-exists" element={<SocialAccountExistsPage />} />
            <Route path="/password-reset" element={<PasswordResetRequestPage />} />
            <Route path="/password-reset-confirm/:uidb64/:token" element={<PasswordResetConfirmPage />} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/users/:username" element={<PublicProfilePage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
