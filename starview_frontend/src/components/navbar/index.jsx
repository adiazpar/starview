/* Navbar Component
 * Minimal inline navigation with logo left, links right.
 * Features transparent background with subtle blur and accent CTA.
 */

import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useExploreFilters } from '../../hooks/useExploreFilters';
import './styles.css';

// Lazy load filter modal - only needed on explore page
const ExploreFiltersModal = lazy(() =>
  import('../explore/ExploreFiltersModal')
);

// Filter chips configuration for mobile explore page
// Labels are translation keys, resolved in component
const FILTER_CONFIG = [
  { id: 'all', labelKey: 'filters.filters', icon: 'fa-solid fa-sliders' },
  { id: 'type', labelKey: 'filters.type' },
  { id: 'rating', labelKey: 'filters.rating' },
  { id: 'distance', labelKey: 'filters.distance' },
  { id: 'verified', labelKey: 'filters.verified', isToggle: true },
];

// Debounce hook for search input
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function Navbar() {
  const { t } = useTranslation('navbar');
  const { theme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [backdropClosing, setBackdropClosing] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const navRef = useRef(null);

  // Filter modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterModalSection, setFilterModalSection] = useState(null);

  // Detect if we're on the explore page
  const isExplorePage = location.pathname === '/explore';

  // Get filter state from URL (only used on explore page)
  const {
    filters,
    setSearch,
    setVerified,
    activeFilterCount,
  } = useExploreFilters();

  // Local search input state (for controlled input + debounce)
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync URL -> input when URL changes (e.g., back/forward navigation)
  useEffect(() => {
    if (filters.search !== searchInput && filters.search !== debouncedSearch) {
      setSearchInput(filters.search || '');
    }
  }, [filters.search]);

  // Sync debounced input -> URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      setSearch(debouncedSearch);
    }
  }, [debouncedSearch, setSearch]);

  // Handle search input change
  const handleSearchChange = useCallback((e) => {
    setSearchInput(e.target.value);
  }, []);

  // Handle search clear
  const handleSearchClear = useCallback(() => {
    setSearchInput('');
    setSearch('');
  }, [setSearch]);

  // Handle opening filter modal
  const handleOpenFilterModal = useCallback((section = null) => {
    setFilterModalSection(section);
    setFilterModalOpen(true);
  }, []);

  const handleCloseFilterModal = useCallback(() => {
    setFilterModalOpen(false);
    setFilterModalSection(null);
  }, []);

  // Handle filter chip click
  const handleFilterChipClick = useCallback((filterId) => {
    if (filterId === 'verified') {
      // Toggle verified filter directly
      setVerified(!filters.verified);
    } else {
      // Open filter modal with section
      handleOpenFilterModal(filterId === 'all' ? null : filterId);
    }
  }, [filters.verified, setVerified, handleOpenFilterModal]);

  // Show filter chips row only on mobile/tablet explore page
  const showFilterChips = isExplorePage && !isDesktop;

  // Dynamically measure navbar height and set CSS variable globally
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const updateNavbarHeight = () => {
      const height = nav.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--navbar-total-height', `${height}px`);
    };

    const resizeObserver = new ResizeObserver(updateNavbarHeight);
    resizeObserver.observe(nav);
    updateNavbarHeight();

    return () => resizeObserver.disconnect();
  }, [isExplorePage]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const effectiveTheme = theme === 'auto'
    ? (systemPrefersDark ? 'dark' : 'light')
    : theme;

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Handle backdrop visibility with delay for fade-out animation
  // Respects prefers-reduced-motion for instant transitions
  useEffect(() => {
    if (mobileMenuOpen) {
      setBackdropVisible(true);
      setBackdropClosing(false);
    } else if (backdropVisible) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const delay = prefersReducedMotion ? 0 : 300;

      setBackdropClosing(true);
      const timer = setTimeout(() => {
        setBackdropVisible(false);
        setBackdropClosing(false);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [mobileMenuOpen, backdropVisible]);

  return (
    <nav ref={navRef} className="navbar">
      <div className="navbar__container">
        {/* Logo with crop animation for explore page */}
        <Link to="/" className="navbar__logo">
          <div className={`navbar__logo-crop ${isExplorePage && !isDesktop ? 'navbar__logo-crop--explore' : ''}`}>
            <img
              src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
              alt="Starview"
              className="navbar__logo-img"
            />
          </div>
        </Link>

        {/* Search bar - mobile explore only */}
        {isExplorePage && !isDesktop && (
          <div className="navbar__search navbar__search--mobile">
            <i className="fa-solid fa-magnifying-glass navbar__search-icon"></i>
            <input
              type="text"
              className="navbar__search-input"
              placeholder={t('search.placeholderShort')}
              aria-label={t('search.placeholderShort')}
              value={searchInput}
              onChange={handleSearchChange}
            />
            {searchInput && (
              <button
                className="navbar__search-clear"
                onClick={handleSearchClear}
                aria-label={t('search.clearSearch')}
                type="button"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
        )}

        {/* Center section - contains nav links, plus search/filter on explore page */}
        <div className="navbar__center">
          {/* Search/filter wrapper - always rendered on desktop for smooth animations */}
          {isDesktop && (
            <div className={`navbar__explore-controls ${isExplorePage ? 'navbar__explore-controls--visible' : ''}`}>
              <div className="navbar__search">
                <i className="fa-solid fa-magnifying-glass navbar__search-icon"></i>
                <input
                  type="text"
                  className="navbar__search-input"
                  placeholder={t('search.placeholder')}
                  aria-label={t('search.placeholder')}
                  value={searchInput}
                  onChange={handleSearchChange}
                />
                {searchInput && (
                  <button
                    className="navbar__search-clear"
                    onClick={handleSearchClear}
                    aria-label={t('search.clearSearch')}
                    type="button"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
              <button
                className={`navbar__filters-btn ${activeFilterCount > 0 ? 'navbar__filters-btn--active' : ''}`}
                onClick={() => handleOpenFilterModal()}
                aria-label={t('filters.filters')}
              >
                <i className="fa-solid fa-sliders"></i>
                {activeFilterCount > 0 && (
                  <span className="navbar__filters-badge">{activeFilterCount}</span>
                )}
              </button>
            </div>
          )}

          {/* Desktop Navigation Links */}
          <div className="navbar__nav">
            <NavLink to="/" className="navbar__link" end>{t('nav.home')}</NavLink>
            <NavLink to="/explore" className="navbar__link">{t('nav.explore')}</NavLink>
            <NavLink to="/sky" className="navbar__link">{t('nav.sky')}</NavLink>
            {isAuthenticated ? (
              <NavLink to={`/users/${user?.username}`} className="navbar__link">{t('nav.profile')}</NavLink>
            ) : (
              <NavLink to="/login" className="navbar__link">{t('nav.login')}</NavLink>
            )}
          </div>
        </div>

        {/* Desktop CTA Button */}
        <div className="navbar__actions">
          {isAuthenticated ? (
            <button onClick={logout} className="navbar__cta btn-primary btn-primary--sm">
              <span>{t('nav.logout')}</span>
            </button>
          ) : (
            <NavLink to="/register" className="navbar__cta btn-primary btn-primary--sm">
              {t('nav.getStarted')}
            </NavLink>
          )}
        </div>

        {/* Hamburger Button */}
        <button
          className={`navbar__hamburger ${mobileMenuOpen ? 'open' : ''}`}
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Mobile Menu */}
        <div className={`navbar__mobile ${mobileMenuOpen ? 'navbar__mobile--open' : ''}`}>
          <NavLink to="/" className="navbar__mobile-link" onClick={closeMobileMenu} end>
            <i className="fa-regular fa-house"></i>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/explore" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-magnifying-glass"></i>
            {t('nav.explore')}
          </NavLink>
          <NavLink to="/sky" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-regular fa-moon"></i>
            {t('nav.sky')}
          </NavLink>

          {isAuthenticated ? (
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-regular fa-user"></i>
                {t('nav.profile')}
              </NavLink>
              <button
                onClick={() => { closeMobileMenu(); logout(); }}
                className="navbar__mobile-link"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-solid fa-arrow-right-to-bracket"></i>
                {t('nav.login')}
              </NavLink>
              <NavLink to="/register" className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-solid fa-user-plus"></i>
                {t('nav.getStarted')}
              </NavLink>
            </>
          )}
        </div>

        {/* Mobile Menu Backdrop */}
        {backdropVisible && (
          <div
            className={`navbar__backdrop ${backdropClosing ? 'navbar__backdrop--closing' : ''}`}
            onClick={closeMobileMenu}
          ></div>
        )}
      </div>

      {/* Filter Chips - mobile/tablet explore page only */}
      {showFilterChips && (
        <div className="navbar__filters">
          <div className="navbar__filters-scroll">
            {FILTER_CONFIG.map((filter) => {
              // Determine if this filter chip should show as active
              const isActive = filter.id === 'all'
                ? activeFilterCount > 0
                : filter.id === 'type'
                  ? filters.types.length > 0
                  : filter.id === 'rating'
                    ? filters.minRating !== null
                    : filter.id === 'distance'
                      ? !!filters.near
                      : filter.id === 'verified'
                        ? filters.verified
                        : false;

              return (
                <button
                  key={filter.id}
                  className={`navbar__filter-chip ${isActive ? 'navbar__filter-chip--active' : ''}`}
                  onClick={() => handleFilterChipClick(filter.id)}
                >
                  {filter.icon ? (
                    activeFilterCount > 0 ? (
                      <span className="navbar__filter-badge">{activeFilterCount}</span>
                    ) : (
                      <i className={`${filter.icon} navbar__filter-icon`}></i>
                    )
                  ) : filter.isToggle ? (
                    <i className={`fa-solid ${isActive ? 'fa-check' : 'fa-circle-check'} navbar__filter-icon`}></i>
                  ) : (
                    <i className="fa-solid fa-caret-down navbar__filter-caret"></i>
                  )}
                  <span>{t(filter.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Modal - only rendered on explore page when opened */}
      {isExplorePage && filterModalOpen && (
        <Suspense fallback={null}>
          <ExploreFiltersModal
            isOpen={filterModalOpen}
            onClose={handleCloseFilterModal}
            initialSection={filterModalSection}
          />
        </Suspense>
      )}
    </nav>
  );
}

export default Navbar;
