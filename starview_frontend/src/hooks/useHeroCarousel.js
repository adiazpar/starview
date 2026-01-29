/**
 * useHeroCarousel Hook
 *
 * Fetches hero carousel images with React Query caching.
 * Handles image preloading to ensure smooth initial render.
 * Caches for 24 hours since images are daily-rotated.
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { locationsApi } from '../services/locations';

export function useHeroCarousel() {
  const [isReady, setIsReady] = useState(false);

  const query = useQuery({
    queryKey: ['heroCarousel'],
    queryFn: async () => {
      const response = await locationsApi.getHeroCarousel();
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - images rotate daily
    gcTime: 24 * 60 * 60 * 1000,    // Keep in cache for 24 hours
  });

  // Preload first image before marking as ready
  useEffect(() => {
    if (query.data && query.data.length > 0 && !isReady) {
      const firstImage = new Image();
      firstImage.onload = () => setIsReady(true);
      firstImage.onerror = () => setIsReady(true); // Show carousel even if first image fails
      firstImage.src = query.data[0].image_url;
    }
  }, [query.data, isReady]);

  return {
    images: query.data || [],
    isLoading: query.isLoading,
    isReady,
    isError: query.isError,
  };
}
