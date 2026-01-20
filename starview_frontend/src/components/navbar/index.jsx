/* Navbar Component
 * Minimal inline navigation with logo left, links right.
 * Features transparent background with subtle blur and accent CTA.
 */

import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import './styles.css';

const FILTERS = [
  { id: 'all', label: 'All', icon: 'fa-solid fa-sliders' },
  { id: 'bortle', label: 'Bortle Class' },
  { id: 'distance', label: 'Distance Away' },
  { id: 'rating', label: 'Rating' },
  { id: 'amenities', label: 'Amenities' },
];

function Navbar() {
  const { theme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [backdropClosing, setBackdropClosing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const navRef = useRef(null);

  // Detect if we're on the explore page
  const isExplorePage = location.pathname === '/explore';

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
  useEffect(() => {
    if (mobileMenuOpen) {
      setBackdropVisible(true);
      setBackdropClosing(false);
    } else if (backdropVisible) {
      setBackdropClosing(true);
      const timer = setTimeout(() => {
        setBackdropVisible(false);
        setBackdropClosing(false);
      }, 300);
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
              placeholder="Search locations..."
              aria-label="Search locations"
            />
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
                  placeholder="Search stargazing locations..."
                  aria-label="Search locations"
                />
              </div>
              <button className="navbar__filters-btn" aria-label="Filters">
                <i className="fa-solid fa-sliders"></i>
              </button>
            </div>
          )}

          {/* Desktop Navigation Links */}
          <div className="navbar__nav">
            <NavLink to="/" className="navbar__link" end>Home</NavLink>
            <NavLink to="/explore" className="navbar__link">Explore</NavLink>
            <NavLink to="/sky" className="navbar__link">Sky</NavLink>
            {isAuthenticated ? (
              <NavLink to={`/users/${user?.username}`} className="navbar__link">Profile</NavLink>
            ) : (
              <NavLink to="/login" className="navbar__link">Login</NavLink>
            )}
          </div>
        </div>

        {/* Desktop CTA Button */}
        <div className="navbar__actions">
          {isAuthenticated ? (
            <button onClick={logout} className="navbar__cta btn-primary btn-primary--sm">
              <span>Logout</span>
            </button>
          ) : (
            <NavLink to="/register" className="navbar__cta btn-primary btn-primary--sm">
              Get Started
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
            Home
          </NavLink>
          <NavLink to="/explore" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-magnifying-glass"></i>
            Explore
          </NavLink>
          <NavLink to="/sky" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-regular fa-moon"></i>
            Sky
          </NavLink>

          {isAuthenticated ? (
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-regular fa-user"></i>
                Profile
              </NavLink>
              <button
                onClick={() => { closeMobileMenu(); logout(); }}
                className="navbar__mobile-link"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-solid fa-arrow-right-to-bracket"></i>
                Login
              </NavLink>
              <NavLink to="/register" className="navbar__mobile-link" onClick={closeMobileMenu}>
                <i className="fa-solid fa-user-plus"></i>
                Get Started
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
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                className="navbar__filter-chip"
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.icon
                  ? <i className={`${filter.icon} navbar__filter-icon`}></i>
                  : <i className="fa-solid fa-caret-down navbar__filter-caret"></i>
                }
                <span>{filter.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
