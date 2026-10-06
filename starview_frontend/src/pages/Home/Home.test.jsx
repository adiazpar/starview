import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import translations from '../../../public/locales/en/common.json';
import api from '../../services/api';
import { locationsApi } from '../../services/locations';
import { LocationProvider } from '../../contexts/LocationContext';
import HomePage from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key.split('.').reduce((value, part) => value?.[part], translations) || key }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../hooks/useHeroCarousel', () => ({ useHeroCarousel: () => ({ images: [], isReady: true }) }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/locations', () => ({ locationsApi: { getPopularNearby: vi.fn() } }));
vi.mock('../../components/home/HeroCarousel', () => ({ default: () => null }));
vi.mock('../../components/home/ProfileSetupCard', () => ({ default: () => null }));
vi.mock('../../components/explore/LocationCard', () => ({ default: ({ location }) => <article>{location.name}</article> }));
vi.mock('../../components/shared/LocationAutocomplete', () => ({
  default: ({ onSelect, placeholder }) => <button onClick={() => onSelect({
    location: 'Selected destination', latitude: 40, longitude: -74,
  })}>{placeholder}</button>,
}));

let geolocation;
let client;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  geolocation = vi.fn(resolve => resolve({ coords: { latitude: 0, longitude: 0 } }));
  vi.stubGlobal('navigator', {
    permissions: { query: vi.fn().mockResolvedValue(Object.assign(new EventTarget(), { state: 'prompt' })) },
    geolocation: { getCurrentPosition: geolocation },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  api.get.mockResolvedValue({ data: { source: 'unavailable' } });
  locationsApi.getPopularNearby.mockResolvedValue({ data: [{ id: 1, name: 'Nearby observatory' }] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mountHome() {
  return render(<MemoryRouter><QueryClientProvider client={client}><LocationProvider>
    <HomePage />
  </LocationProvider></QueryClientProvider></MemoryRouter>);
}

async function renderHome() {
  mountHome();
  const button = await screen.findByRole('button', { name: 'Use my current location' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('Home current location and nearby results', () => {
  it('waits for initial browser location and nearby results before revealing the home content', async () => {
    let resolvePosition;
    let resolveNearby;
    navigator.permissions.query.mockResolvedValue(Object.assign(new EventTarget(), { state: 'granted' }));
    geolocation.mockImplementation(resolve => { resolvePosition = resolve; });
    locationsApi.getPopularNearby.mockImplementation(() => new Promise(resolve => { resolveNearby = resolve; }));
    const { container } = mountHome();

    await waitFor(() => expect(resolvePosition).toBeDefined());
    expect(container.querySelector('.loading-spinner-container.full-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();

    await act(async () => resolvePosition({ coords: { latitude: 0, longitude: 0 } }));
    await waitFor(() => expect(resolveNearby).toBeDefined());
    expect(container.querySelector('.loading-spinner-container.full-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    await act(async () => resolveNearby({ data: [] }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search near Current location' })).toBeInTheDocument();
    expect(screen.getByText(translations.location.nearbyEmpty)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();
    expect(container.querySelector('.loading-spinner-container.full-page')).not.toBeInTheDocument();
  });

  it('finishes initial loading when location detection fails without requesting nearby results', async () => {
    let rejectLocation;
    api.get.mockImplementation(() => new Promise((resolve, reject) => { rejectLocation = reject; }));
    const { container } = mountHome();
    await waitFor(() => expect(rejectLocation).toBeDefined());
    expect(container.querySelector('.loading-spinner-container.full-page')).toBeInTheDocument();

    await act(async () => rejectLocation(new Error('Location lookup timed out')));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeEnabled();
    expect(locationsApi.getPopularNearby).not.toHaveBeenCalled();
  });

  it('finishes initial loading with a retry state when the nearby query fails', async () => {
    api.get.mockResolvedValue({ data: { source: 'ip', latitude: 10, longitude: 20, city: 'Test city' } });
    locationsApi.getPopularNearby.mockRejectedValue(new Error('Nearby unavailable'));
    const { container } = mountHome();

    expect(await screen.findByText(translations.location.nearbyError)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.loading-spinner-container.full-page')).not.toBeInTheDocument();
  });

  it('keeps Home visible while locating, then hides the action and loads cards for the new coordinates', async () => {
    let resolvePosition;
    let resolveNearby;
    geolocation.mockImplementation(resolve => { resolvePosition = resolve; });
    locationsApi.getPopularNearby.mockImplementation(() => new Promise(resolve => { resolveNearby = resolve; }));
    fireEvent.click(await renderHome());
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finding your location…' })).toBeDisabled();

    await act(async () => resolvePosition({ coords: { latitude: 0, longitude: 0 } }));
    await waitFor(() => expect(locationsApi.getPopularNearby).toHaveBeenCalledWith({ lat: 0, lng: 0 }));
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();
    expect(screen.getByText('Finding nearby sites…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    await act(async () => resolveNearby({ data: [{ id: 1, name: 'Nearby observatory' }] }));
    expect(await screen.findByText('Nearby observatory')).toBeInTheDocument();
    // An intentional search restores the option to return to current location.
    fireEvent.click(screen.getByRole('button', { name: 'Search near Current location' }));
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument();
  });

  it('explains an empty nearby search after successful geolocation', async () => {
    locationsApi.getPopularNearby.mockResolvedValue({ data: [] });
    fireEvent.click(await renderHome());
    expect(await screen.findByText(translations.location.nearbyEmpty)).toBeInTheDocument();
    const emptyState = screen.getByText(translations.location.nearbyEmpty).closest('[role="status"]');
    expect(emptyState.querySelector('a, button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();
  });

  it('distinguishes a failed nearby request from no sites and lets the user retry', async () => {
    locationsApi.getPopularNearby.mockRejectedValueOnce(new Error('Network unavailable'));
    fireEvent.click(await renderHome());
    expect(await screen.findByText(translations.location.nearbyError)).toBeInTheDocument();
    expect(screen.queryByText(translations.location.nearbyEmpty)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nearby observatory')).toBeInTheDocument();
  });

  it('retains the location action when the browser cannot resolve a position', async () => {
    geolocation.mockImplementation((resolve, reject) => reject(new Error('Location unavailable')));
    fireEvent.click(await renderHome());
    expect(await screen.findByText(translations.location.unavailable)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeEnabled();
    expect(locationsApi.getPopularNearby).not.toHaveBeenCalled();
  });
});
