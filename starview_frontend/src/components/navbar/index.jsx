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

  // Listen for system theme changes (only needed for auto mode logo switching)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Determine which logo to show based on theme setting and system preference
  const effectiveTheme = theme === 'auto'
    ? (systemPrefersDark ? 'dark' : 'light')
    : theme;

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  // Handle backdrop visibility with delay for fade-out animation
  useEffect(() => {
    if (mobileMenuOpen) {
      // Show backdrop immediately when opening
      setBackdropVisible(true);
      setBackdropClosing(false);
    } else if (backdropVisible) {
      // Start closing animation
      setBackdropClosing(true);
      // When closing, wait for animation to finish before hiding
      const timer = setTimeout(() => {
        setBackdropVisible(false);
        setBackdropClosing(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [mobileMenuOpen, backdropVisible]);

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <img
            src={effectiveTheme === 'dark' ? '/images/logo-dark.png' : '/images/logo-light.png'}
            alt="Starview Logo"
            className="logo-size"
          />
        </Link>

        {/* Desktop Navigation Links */}
        <div className="navbar-nav">
          <NavLink to="/" className="navbar-link" end>Home</NavLink>
          <NavLink to="/map" className="navbar-link">Map</NavLink>
          <NavLink to="/explore" className="navbar-link">Explore</NavLink>

          {isAuthenticated ? (
            // Authenticated: Show Profile and Logout
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar-link">Profile</NavLink>
              <button onClick={logout} className="navbar-link login-btn">
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Logout
              </button>
            </>
          ) : (
            // Not authenticated: Show Register and Login
            <>
              <NavLink to="/register" className="navbar-link">Register</NavLink>
              <NavLink to="/login" className="navbar-link login-btn">
                <i className="fa-solid fa-arrow-right-to-bracket"></i>
                Login
              </NavLink>
            </>
          )}
        </div>

        {/* Hamburger Button */}
        <button
          className="navbar-hamburger"
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
        >
          <i className={mobileMenuOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"}></i>
        </button>

        {/* Mobile Menu */}
        <div className={`navbar-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
          <NavLink to="/" className="navbar-mobile-link" onClick={closeMobileMenu} end>
            <i className="fa-regular fa-house"></i>
            Home
          </NavLink>
          <NavLink to="/map" className="navbar-mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-earth-europe"></i>
            Map
          </NavLink>
          <NavLink to="/explore" className="navbar-mobile-link" onClick={closeMobileMenu}>
            <i className="fa-solid fa-magnifying-glass"></i>
            Explore
          </NavLink>

          {isAuthenticated ? (
            // Authenticated: Show Profile and Logout
            <>
              <NavLink to={`/users/${user?.username}`} className="navbar-mobile-link" onClick={closeMobileMenu}>
                <i className="fa-regular fa-user"></i>
                Profile
              </NavLink>
              <button
                onClick={() => {
                  closeMobileMenu();
                  logout();
                }}
                className="navbar-mobile-link"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Logout
              </button>
            </>
          ) : (
            // Not authenticated: Show Register and Login
            <>
              <NavLink to="/register" className="navbar-mobile-link" onClick={closeMobileMenu}>
                <i className="fa-regular fa-user"></i>
                Register
              </NavLink>
              <NavLink to="/login" className="navbar-mobile-link" onClick={closeMobileMenu}>
                <i className="fa-solid fa-arrow-right-to-bracket"></i>
                Login
              </NavLink>
            </>
          )}
        </div>

        {/* Mobile Menu Backdrop */}
        {backdropVisible && (
          <div
            className={`navbar-mobile-backdrop ${backdropClosing ? 'closing' : ''}`}
            onClick={closeMobileMenu}
          ></div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
