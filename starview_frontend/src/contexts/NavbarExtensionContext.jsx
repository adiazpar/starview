/**
 * NavbarExtensionContext
 *
 * Allows pages to inject content into the navbar that appears when scrolling.
 * Used for location detail page action buttons that slide down when the hero
 * scrolls out of view.
 *
 * Usage:
 *   // In a page component:
 *   const { setLocationExtension, setExtensionVisible } = useNavbarExtension();
 *
 *   useEffect(() => {
 *     setLocationExtension({ locationId, locationName, handlers... });
 *     return () => setLocationExtension(null);
 *   }, [locationId]);
 *
 *   // When scroll passes hero:
 *   setExtensionVisible(true);
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const NavbarExtensionContext = createContext(null);

export function NavbarExtensionProvider({ children }) {
  // Location extension data (not JSX - to avoid re-render loops)
  const [locationExtension, setLocationExtensionState] = useState(null);
  // Whether the extension is visible (triggers animation)
  const [isExtensionVisible, setExtensionVisibleState] = useState(false);

  // Use ref to track current location ID to prevent unnecessary updates
  const currentLocationIdRef = useRef(null);

  const setLocationExtension = useCallback((data) => {
    // Only update if location changed or data is null (cleanup)
    if (data === null || data?.locationId !== currentLocationIdRef.current) {
      currentLocationIdRef.current = data?.locationId || null;
      setLocationExtensionState(data);
      if (!data) {
        setExtensionVisibleState(false);
      }
    }
  }, []);

  const updateLocationExtension = useCallback((updates) => {
    setLocationExtensionState(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const setExtensionVisible = useCallback((visible) => {
    setExtensionVisibleState(visible);
  }, []);

  return (
    <NavbarExtensionContext.Provider
      value={{
        locationExtension,
        isExtensionVisible,
        setLocationExtension,
        updateLocationExtension,
        setExtensionVisible,
      }}
    >
      {children}
    </NavbarExtensionContext.Provider>
  );
}

export function useNavbarExtension() {
  const context = useContext(NavbarExtensionContext);
  if (!context) {
    throw new Error('useNavbarExtension must be used within a NavbarExtensionProvider');
  }
  return context;
}
