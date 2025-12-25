/* Pagination Component
 * Displays page numbers for desktop location list navigation.
 * Shows current page, adjacent pages, and first/last with ellipsis.
 */

import { useMemo } from 'react';
import './styles.css';

function Pagination({ currentPage, totalPages, onPageChange }) {
  // Generate array of page numbers to display
  const pages = useMemo(() => {
    const items = [];
    const maxVisible = 7; // Max page buttons to show

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        items.push(i);
      }
    } else {
      // Always show first page
      items.push(1);

      // Calculate range around current page
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      // Adjust range to show more pages when near edges
      if (currentPage <= 3) {
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
      }

      // Add ellipsis before middle pages if needed
      if (start > 2) {
        items.push('...');
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        items.push(i);
      }

      // Add ellipsis after middle pages if needed
      if (end < totalPages - 1) {
        items.push('...');
      }

      // Always show last page
      items.push(totalPages);
    }

    return items;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      {/* Previous button */}
      <button
        className="pagination__btn pagination__btn--nav"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <i className="fa-solid fa-chevron-left"></i>
      </button>

      {/* Page numbers */}
      <div className="pagination__pages">
        {pages.map((page, index) =>
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="pagination__ellipsis">
              ...
            </span>
          ) : (
            <button
              key={page}
              className={`pagination__btn ${page === currentPage ? 'pagination__btn--active' : ''}`}
              onClick={() => onPageChange(page)}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}
      </div>

      {/* Next button */}
      <button
        className="pagination__btn pagination__btn--nav"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <i className="fa-solid fa-chevron-right"></i>
      </button>
    </nav>
  );
}

export default Pagination;
