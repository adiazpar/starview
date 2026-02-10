/* VirtualizedLocationList Component
 * Renders a virtualized list of LocationCards for mobile infinite scroll.
 * Uses window scrolling (no nested scroll container) for proper UX.
 * Only renders visible items plus overscan, dramatically reducing DOM nodes.
 */

import { useCallback, useEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import LocationCard from '../LocationCard';
import LoadingSpinner from '../../shared/LoadingSpinner';
import './styles.css';

function VirtualizedLocationList({
  locations,
  userLocation,
  onPressLocation,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  loadMoreRef,
}) {
  // Estimate row height: 16:10 image + ~90px content + padding
  // For mobile viewport ~375px wide with padding, card width ~343px
  // Estimated height: 343 * 0.625 + 90 + 16 ≈ 320px
  const estimateSize = useCallback(() => 320, []);

  const virtualizer = useWindowVirtualizer({
    count: locations.length,
    estimateSize,
    overscan: 3, // Render 3 extra items above/below viewport
  });

  const items = virtualizer.getVirtualItems();

  // Check if we're near the bottom to trigger load more
  const lastItem = items[items.length - 1];
  const shouldLoadMore = lastItem && lastItem.index >= locations.length - 3;

  // Trigger fetch when approaching end
  useEffect(() => {
    if (shouldLoadMore && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [shouldLoadMore, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="virtualized-list">
      <div
        className="virtualized-list__inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {items.map((virtualRow) => {
          const location = locations[virtualRow.index];
          return (
            <div
              key={location.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtualized-list__item"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <LocationCard
                location={location}
                userLocation={userLocation}
                onPress={onPressLocation}
                style={{ '--card-index': 0 }} // Disable stagger animation in virtual list
              />
            </div>
          );
        })}
      </div>

      {/* Loading indicator at bottom */}
      {isFetchingNextPage && (
        <div className="virtualized-list__loading">
          <LoadingSpinner size="xs" inline />
          <span>Loading more...</span>
        </div>
      )}

      {/* Sentinel for intersection observer fallback */}
      {hasNextPage && !isFetchingNextPage && (
        <div ref={loadMoreRef} className="virtualized-list__sentinel" />
      )}
    </div>
  );
}

export default VirtualizedLocationList;
