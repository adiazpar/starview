/**
 * LocationAutocomplete Component
 *
 * Mapbox-powered location search with autocomplete.
 * Returns city/region selections with coordinates.
 * Used for profile location settings.
 */

import { useState, useCallback, useEffect } from 'react';
import { Geocoder } from '@mapbox/search-js-react';
import './styles.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function LocationAutocomplete({
  value = '',
  onSelect,
  placeholder = "Search for a city or region...",
  disabled = false
}) {
  const [inputValue, setInputValue] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Handle when user selects a location from dropdown
  const handleRetrieve = useCallback((result) => {
    // onRetrieve receives the feature directly OR a response object
    const feature = result.features?.[0] || result;
    if (feature) {
      // Get the formatted place name (try multiple property paths)
      const placeName = feature.properties?.full_address
        || feature.properties?.place_formatted
        || feature.properties?.name
        || feature.place_name
        || '';

      // Get coordinates [longitude, latitude] - try multiple paths
      const coords = feature.geometry?.coordinates || feature.center || [];
      const [longitude, latitude] = coords;

      if (placeName) {
        setInputValue(placeName);
        onSelect?.({
          location: placeName,
          latitude: latitude ?? null,
          longitude: longitude ?? null
        });
      }
    }
  }, [onSelect]);

  // Handle input text changes (typing)
  const handleChange = useCallback((newValue) => {
    setInputValue(newValue);
    // If user clears the input, notify parent to clear location data
    if (!newValue || newValue.trim() === '') {
      onSelect?.({
        location: '',
        latitude: null,
        longitude: null
      });
    }
  }, [onSelect]);

  // Theme to match app's dark design system
  // Uses CSS custom properties from global.css
  const theme = {
    variables: {
      minWidth: '100%',
      fontFamily: "'Karla', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontWeight: '400',
      fontWeightBold: '600',
      fontWeightSemibold: '500',
      unit: '14px',
      lineHeight: '1.5',
      padding: '0.75em 1em',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
      // Dark theme colors
      colorBackground: '#0d1320',
      colorText: '#f0f4f8',
      colorPrimary: '#00d4aa',
      colorSecondary: '#94a3b8',
      colorBackgroundHover: 'rgba(15, 23, 42, 0.8)',
      colorBackgroundActive: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid #1e293b'
    }
  };

  return (
    <div className={`location-autocomplete ${disabled ? 'location-autocomplete--disabled' : ''}`}>
      <Geocoder
        accessToken={MAPBOX_TOKEN}
        value={inputValue}
        onChange={handleChange}
        onRetrieve={handleRetrieve}
        placeholder={placeholder}
        theme={theme}
        options={{
          types: 'place', // Only cities - regions have imprecise center coordinates
          limit: 5
        }}
      />
    </div>
  );
}

export default LocationAutocomplete;
