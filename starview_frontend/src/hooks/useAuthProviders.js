import { useQuery } from '@tanstack/react-query';
import authApi from '../services/auth';

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: async () => {
      const { data } = await authApi.getProviders();
      return { apple: data.apple };
    },
    staleTime: 60_000,
  });
}
