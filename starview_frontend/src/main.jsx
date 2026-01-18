import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import ErrorBoundary from './components/shared/ErrorBoundary'
import ToastContainer from './components/shared/Toast'
import CookieConsent from './components/CookieConsent'
import Starfield from './components/starfield'
import Navbar from './components/navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <ToastProvider>
            <CookieConsentProvider>
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
            </CookieConsentProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
