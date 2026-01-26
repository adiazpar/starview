import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { LocationProvider } from './contexts/LocationContext'
import { ToastProvider } from './contexts/ToastContext'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import { NavbarExtensionProvider } from './contexts/NavbarExtensionContext'
import ErrorBoundary from './components/shared/ErrorBoundary'
import ToastContainer from './components/shared/Toast'
import CookieConsent from './components/CookieConsent'
import Starfield from './components/starfield'
import Navbar from './components/navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import './i18n/config'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      // Don't retry rate-limited requests (429) - retrying just makes throttling worse
      retry: (failureCount, error) => {
        if (error?.response?.status === 429) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <QueryClientProvider client={queryClient}>
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
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
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
      </QueryClientProvider>
    </Suspense>
  </StrictMode>,
)
