/* Navbar Component
 * Minimal inline navigation with logo left, links right.
 * Features transparent background with subtle blur and accent CTA.
 */

import { Link, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import './styles.css';

function Navbar() {
  const { theme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [backdropClosing, setBackdropClosing] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

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
    <nav className="navbar">
      <div className="navbar__container">
        {/* Logo */}
        <Link to="/" className="navbar__logo">
          <img
            src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
            alt="Starview"
            className="navbar__logo-img"
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="navbar__nav">
          <NavLink to="/" className="navbar__link" end>Home</NavLink>
          <NavLink to="/map" className="navbar__link">Map</NavLink>
          <NavLink to="/explore" className="navbar__link">Explore</NavLink>

          {isAuthenticated ? (
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar__link">Profile</NavLink>
              <button onClick={logout} className="navbar__cta btn-primary btn-primary--sm">
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
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
          className="navbar__hamburger"
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className={`navbar__hamburger-line ${mobileMenuOpen ? 'open' : ''}`}></span>
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
    </nav>
  );
}

export default Navbar;
