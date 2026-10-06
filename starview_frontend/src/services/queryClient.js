import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
        // Don't retry rate-limited requests (429) - retrying just makes throttling worse
        retry: (failureCount, error) => {
          if (error?.response?.status === 429) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}
