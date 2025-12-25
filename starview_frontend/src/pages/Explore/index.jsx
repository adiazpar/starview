/* Explore Page
 * Displays stargazing locations with map/list toggle.
 * Mobile-first design inspired by AllTrails UX patterns.
 */

import { useState } from 'react';
import LocationCard from '../../components/explore/LocationCard';
import ViewToggle from '../../components/explore/ViewToggle';
import './styles.css';

// Mock data for development - will be replaced with API calls
const MOCK_LOCATIONS = [
  {
    id: 1,
    name: 'Cherry Springs State Park',
    region: 'Pennsylvania',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
    bortleClass: 2,
    rating: 4.9,
    reviewCount: 342,
    distance: '127 mi',
    isSaved: false,
  },
  {
    id: 2,
    name: 'Big Bend National Park',
    region: 'Texas',
    image: 'https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&q=80',
    bortleClass: 1,
    rating: 4.8,
    reviewCount: 891,
    distance: '445 mi',
    isSaved: true,
  },
  {
    id: 3,
    name: 'Natural Bridges Monument',
    region: 'Utah',
    image: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&q=80',
    bortleClass: 2,
    rating: 4.7,
    reviewCount: 256,
    distance: '892 mi',
    isSaved: false,
  },
  {
    id: 4,
    name: 'Death Valley National Park',
    region: 'California',
    image: 'https://images.unsplash.com/photo-1504700610630-ac6uj5d2e700?w=800&q=80',
    bortleClass: 1,
    rating: 4.9,
    reviewCount: 1203,
    distance: '1,247 mi',
    isSaved: false,
  },
  {
    id: 5,
    name: 'Headlands Dark Sky Park',
    region: 'Michigan',
    image: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=800&q=80',
    bortleClass: 3,
    rating: 4.6,
    reviewCount: 187,
    distance: '312 mi',
    isSaved: false,
  },
  {
    id: 6,
    name: 'Great Basin National Park',
    region: 'Nevada',
    image: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80',
    bortleClass: 2,
    rating: 4.8,
    reviewCount: 423,
    distance: '1,089 mi',
    isSaved: false,
  },
];

function ExplorePage() {
  const [view, setView] = useState('list');

  const handleToggleView = () => {
    setView(view === 'list' ? 'map' : 'list');
  };

  const handleSaveLocation = (id, saved) => {
    console.log(`Location ${id} ${saved ? 'saved' : 'unsaved'}`);
  };

  const handlePressLocation = (location) => {
    console.log('Navigate to location:', location.name);
  };

  return (
    <div className="explore-page">
      {view === 'list' ? (
        <div className="explore-page__list">
          {MOCK_LOCATIONS.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onSave={handleSaveLocation}
              onPress={handlePressLocation}
            />
          ))}
        </div>
      ) : (
        <div className="explore-page__map">
          <div className="explore-page__map-placeholder">
            <i className="fa-solid fa-map"></i>
            <p>Map view coming soon</p>
          </div>
        </div>
      )}

      <ViewToggle view={view} onToggle={handleToggleView} />
    </div>
  );
}

export default ExplorePage;
