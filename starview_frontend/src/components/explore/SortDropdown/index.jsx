/* SortDropdown Component
 * Dropdown menu for sorting locations on the Explore page.
 * Uses glass-card styling from global.css.
 */

import { useState, useRef, useEffect } from 'react';
import './styles.css';

// Human-readable labels for sort options
const SORT_LABELS = {
  '-created_at': 'Newest',
  'created_at': 'Oldest',
  '-average_rating': 'Highest Rated',
  'average_rating': 'Lowest Rated',
  '-review_count': 'Most Reviews',
  'review_count': 'Fewest Reviews',
};

const SORT_OPTIONS = [
  '-created_at',
  '-average_rating',
  '-review_count',
];

function SortDropdown({ currentSort, onSortChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const currentLabel = SORT_LABELS[currentSort] || 'Newest';

  const handleSelect = (sortValue) => {
    onSortChange(sortValue);
    setIsOpen(false);
  };

  return (
    <div className="sort-dropdown" ref={dropdownRef}>
      <button
        className="sort-dropdown__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <i className="fa-solid fa-sort"></i>
        <span>{currentLabel}</span>
        <i className={`fa-solid fa-chevron-down sort-dropdown__chevron ${isOpen ? 'sort-dropdown__chevron--open' : ''}`}></i>
      </button>

      {isOpen && (
        <ul className="sort-dropdown__menu" role="listbox">
          {SORT_OPTIONS.map((sortValue) => (
            <li key={sortValue}>
              <button
                className={`sort-dropdown__option ${currentSort === sortValue ? 'sort-dropdown__option--active' : ''}`}
                onClick={() => handleSelect(sortValue)}
                role="option"
                aria-selected={currentSort === sortValue}
              >
                {SORT_LABELS[sortValue]}
                {currentSort === sortValue && (
                  <i className="fa-solid fa-check sort-dropdown__check"></i>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SortDropdown;
