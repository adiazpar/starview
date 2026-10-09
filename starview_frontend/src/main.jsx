import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocationProvider } from './contexts/LocationContext'
import { ToastProvider } from './contexts/ToastContext'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import { NavbarExtensionProvider } from './contexts/NavbarExtensionContext'
import RouteErrorBoundary from './components/shared/ErrorBoundary/RouteErrorBoundary'
import ToastContainer from './components/shared/Toast'
import CookieConsent from './components/CookieConsent'
import Starfield from './components/starfield'
import Navbar from './components/navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import './i18n/config'
import './index.css'
import App from './App.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <LocationProvider>
              <ToastProvider>
              <CookieConsentProvider>
              <NavbarExtensionProvider>
                <Starfield />
                <Navbar />
                <div className="page-wrapper">
                  <RouteErrorBoundary>
                    <App />
                  </RouteErrorBoundary>
                  <Footer />
                </div>
                <ToastContainer />
                <CookieConsent />
              </NavbarExtensionProvider>
              </CookieConsentProvider>
            </ToastProvider>
            </LocationProvider>
          </AuthProvider>
        </BrowserRouter>
    </Suspense>
  </StrictMode>,
)
