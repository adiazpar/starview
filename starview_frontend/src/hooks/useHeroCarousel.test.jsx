import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { locationsApi } from '../services/locations';
import { useHeroCarousel } from './useHeroCarousel';

vi.mock('../services/locations', () => ({ locationsApi: { getHeroCarousel: vi.fn() } }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderCarousel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useHeroCarousel(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe('home carousel readiness', () => {
  it('allows the home page to render when the database has no gallery images', async () => {
    locationsApi.getHeroCarousel.mockResolvedValue({ data: [] });
    const { result } = renderCarousel();
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.images).toEqual([]);
  });

  it('allows the home page to render when the gallery request fails', async () => {
    locationsApi.getHeroCarousel.mockRejectedValue(new Error('Gallery unavailable'));
    const { result } = renderCarousel();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isReady).toBe(true);
  });

  it.each(['onload', 'onerror'])('finishes preloading when the first image fires %s', async event => {
    const images = [];
    vi.stubGlobal('Image', class { constructor() { images.push(this); } });
    locationsApi.getHeroCarousel.mockResolvedValue({ data: [{ id: 1, image_url: '/test.jpg' }] });
    const { result } = renderCarousel();
    await waitFor(() => expect(images).toHaveLength(1));
    expect(result.current.isReady).toBe(false);
    act(() => images[0][event]());
    expect(result.current.isReady).toBe(true);
  });
});
