/* Navbar Component
 * Minimal inline navigation with logo left, links right.
 * Features transparent background with subtle blur and accent CTA.
 */

import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import './styles.css';

const FILTERS = [
  { id: 'all', label: 'All', icon: 'fa-solid fa-sliders' },
  { id: 'bortle', label: 'Bortle Class' },
  { id: 'distance', label: 'Distance' },
  { id: 'rating', label: 'Rating' },
  { id: 'amenities', label: 'Amenities' },
];

function Navbar() {
  const { theme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [backdropClosing, setBackdropClosing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const navRef = useRef(null);

  // Detect if we're on the explore page for navbar transformation
  const isExplorePage = location.pathname === '/explore';

  // Dynamically measure navbar height and set CSS variable globally
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const updateNavbarHeight = () => {
      const height = nav.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--navbar-total-height', `${height}px`);
    };

    // Use ResizeObserver to watch for height changes (including filter row animation)
    const resizeObserver = new ResizeObserver(updateNavbarHeight);
    resizeObserver.observe(nav);

    // Initial measurement
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
        <div className={`navbar__brand ${isExplorePage ? 'navbar__brand--explore' : ''}`}>
          <Link to="/" className="navbar__logo">
            {/* Logo container - crops from right to left on explore */}
            <div className="navbar__logo-crop">
              <img
                src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
                alt="Starview"
                className="navbar__logo-img"
              />
            </div>
          </Link>

          {/* Search bar - appears on explore page */}
          <div className="navbar__search">
            <i className="fa-solid fa-magnifying-glass navbar__search-icon"></i>
            <input
              type="text"
              className="navbar__search-input"
              placeholder="Search stargazing locations..."
              aria-label="Search locations"
            />
          </div>
        </div>

        {/* Desktop Navigation */}
        <div className="navbar__nav">
          <NavLink to="/" className="navbar__link" end>Home</NavLink>
          <NavLink to="/map" className="navbar__link">Map</NavLink>
          <NavLink to="/explore" className="navbar__link">Explore</NavLink>

          {isAuthenticated ? (
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar__link">Profile</NavLink>
              <button onClick={logout} className="navbar__cta btn-primary btn-primary--sm">
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="navbar__link">Login</NavLink>
              <NavLink to="/register" className="navbar__cta btn-primary btn-primary--sm">
                Get Started
              </NavLink>
            </>
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
          <NavLink to="/map" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-earth-europe"></i>
            Map
          </NavLink>
          <NavLink to="/explore" className="navbar__mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-magnifying-glass"></i>
            Explore
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
              <NavLink to="/register" className="navbar__mobile-cta btn-primary btn-primary--full" onClick={closeMobileMenu}>
                <i className="fa-regular fa-user"></i>
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

      {/* Filter Chips - appears on explore page */}
      <div className={`navbar__filters ${isExplorePage ? 'navbar__filters--visible' : ''}`}>
        <div className="navbar__filters-scroll">
          {FILTERS.map((filter, index) => (
            <button
              key={filter.id}
              className={`navbar__filter-chip ${activeFilter === filter.id ? 'navbar__filter-chip--active' : ''}`}
              onClick={() => setActiveFilter(filter.id)}
              style={{ '--chip-index': index }}
            >
              {filter.icon && <i className={filter.icon}></i>}
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
