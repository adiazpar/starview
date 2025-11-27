import { useState, useEffect } from 'react';

export function useTheme() {
  // Initialize theme by checking localStorage or what's already applied to the document
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'auto' || savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    // Fallback to checking document attribute
    const hasLightTheme = document.documentElement.hasAttribute('data-theme');
    return hasLightTheme ? 'light' : 'dark';
  });

  // Sync theme state across all components using this hook
  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail);
    };

    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  // Apply theme to document when theme changes
  useEffect(() => {
    // SYNC WITH: index.html bgBase values
    const bgBase = { dark: '#111827', light: '#ffffff' };

    let effectiveTheme;
    if (theme === 'auto') {
      // Auto mode: detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
      if (prefersDark) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } else if (theme === 'light') {
      effectiveTheme = 'light';
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      effectiveTheme = 'dark';
      document.documentElement.removeAttribute('data-theme');
    }

    // Update inline background color to match theme (prevents flash artifacts)
    document.documentElement.style.backgroundColor = bgBase[effectiveTheme];
  }, [theme]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (theme !== 'auto') return;

    // SYNC WITH: index.html bgBase values
    const bgBase = { dark: '#111827', light: '#ffffff' };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (e.matches) {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.style.backgroundColor = bgBase.dark;
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.backgroundColor = bgBase.light;
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Helper function to update theme and notify all components
  const updateTheme = (newTheme) => {
    localStorage.setItem('theme', newTheme);
    setTheme(newTheme);
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }));
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    updateTheme(newTheme);
  };

  const setThemeMode = (mode) => {
    updateTheme(mode);
  };

  return { theme, toggleTheme, setThemeMode };
}
