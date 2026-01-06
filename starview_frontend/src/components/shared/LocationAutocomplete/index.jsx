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

  // Theme to match app's design system
  const theme = {
    variables: {
      minWidth: '100%',
      fontFamily: "'Karla', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontWeight: '400',
      fontWeightBold: '600',
      fontWeightSemibold: '500',
      unit: '14px',
      lineHeight: '1.5',
      padding: '12px 16px'
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
          types: 'place,region',
          limit: 5
        }}
      />
    </div>
  );
}

export default LocationAutocomplete;
