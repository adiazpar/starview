/**
 * DateNavigator Component
 *
 * Calendar-based date picker for exploring moon phases and stargazing conditions.
 * Click the date to open a calendar popup, navigate months with arrows.
 * Observatory aesthetic with glass-morphic styling.
 */

import { useState, useRef, useEffect } from 'react';
import './styles.css';

/**
 * Format date for display
 * @param {Date} date
 * @returns {string} e.g., "Jan 15, 2026"
 */
const formatDisplayDate = (date) => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Check if two dates are the same calendar day
 */
const isSameDay = (date1, date2) => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

/**
 * Get days in a month
 */
const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

/**
 * Get day of week for first day of month (0 = Sunday)
 */
const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month, 1).getDay();
};

/**
 * Month names
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Day abbreviations
 */
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * DateNavigator Component
 *
 * @param {Date} selectedDate - Currently selected date
 * @param {Function} onDateChange - Callback when date changes
 */
function DateNavigator({ selectedDate, onDateChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const containerRef = useRef(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset view to selected date when opening
  useEffect(() => {
    if (isOpen) {
      setViewMonth(selectedDate.getMonth());
      setViewYear(selectedDate.getFullYear());
    }
  }, [isOpen, selectedDate]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDateSelect = (day) => {
    const newDate = new Date(viewYear, viewMonth, day);
    onDateChange(newDate);
    setIsOpen(false);
  };

  const handleToday = (e) => {
    e.stopPropagation();
    onDateChange(new Date(today));
    setIsOpen(false);
  };

  // Generate calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const days = [];

  // Empty cells for days before first of month
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="date-navigator__day date-navigator__day--empty" />);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewYear, viewMonth, day);
    const isSelected = isSameDay(date, selectedDate);
    const isTodayDate = isSameDay(date, today);

    days.push(
      <button
        key={day}
        className={`date-navigator__day ${isSelected ? 'date-navigator__day--selected' : ''} ${isTodayDate ? 'date-navigator__day--today' : ''}`}
        onClick={() => handleDateSelect(day)}
      >
        {day}
      </button>
    );
  }

  return (
    <div className="date-navigator" ref={containerRef}>
      {/* Date display - click to open calendar */}
      <button className="date-navigator__trigger" onClick={handleToggle}>
        <span className="date-navigator__date">{formatDisplayDate(selectedDate)}</span>
        <svg
          className={`date-navigator__chevron ${isOpen ? 'date-navigator__chevron--open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Calendar popup */}
      {isOpen && (
        <div className="date-navigator__calendar">
          {/* Month/Year header */}
          <div className="date-navigator__header">
            <button
              className="date-navigator__nav"
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <span className="date-navigator__month-year">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              className="date-navigator__nav"
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Day names */}
          <div className="date-navigator__weekdays">
            {DAY_NAMES.map((name) => (
              <div key={name} className="date-navigator__weekday">{name}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="date-navigator__grid">
            {days}
          </div>

          {/* Today shortcut */}
          <button className="date-navigator__today-btn" onClick={handleToday}>
            Go to Today
          </button>
        </div>
      )}
    </div>
  );
}

export default DateNavigator;
