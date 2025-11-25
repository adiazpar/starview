import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/navbar';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/Home';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import VerifyEmailPage from './pages/VerifyEmail';
import EmailVerifiedPage from './pages/EmailVerified';
import EmailConfirmErrorPage from './pages/EmailConfirmError';
import SocialAccountExistsPage from './pages/SocialAccountExists';
import PasswordResetRequestPage from './pages/PasswordResetRequest';
import PasswordResetConfirmPage from './pages/PasswordResetConfirm';
import ProfilePage from './pages/Profile';
import PublicProfilePage from './pages/PublicProfile';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
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
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
