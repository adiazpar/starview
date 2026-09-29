import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import { LocationProvider, useLocation } from './LocationContext';

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }));
let permission;
let geolocation;
const ip = { latitude: 10, longitude: 20, city: 'Test city', source: 'ip' };

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  permission = Object.assign(new EventTarget(), { state: 'prompt' });
  geolocation = vi.fn(resolve => resolve({ coords: { latitude: 0, longitude: 0 } }));
  vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue(permission) },
    geolocation: { getCurrentPosition: geolocation } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  api.get.mockResolvedValue({ data: ip });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderLocation(strict = false) {
  return renderHook(useLocation, { wrapper: ({ children }) => strict
    ? <StrictMode><LocationProvider>{children}</LocationProvider></StrictMode>
    : <LocationProvider>{children}</LocationProvider> });
}

describe('location evidence and refresh', () => {
  it('discards the old fake IP cache and leaves unknown location unset', async () => {
    sessionStorage.setItem('starview_ip_location', JSON.stringify({ data: ip, timestamp: Date.now() }));
    sessionStorage.setItem('starview_active_location', JSON.stringify({ data: ip, source: 'ip' }));
    api.get.mockResolvedValue({ data: { latitude: null, longitude: null, source: 'unavailable' } });
    const { result } = renderLocation();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.actualLocation).toBeNull();
    expect(result.current.location).toBeNull();
    expect(sessionStorage.getItem('starview_ip_location')).toBeNull();
    expect(geolocation).not.toHaveBeenCalled();
  });

  it('updates both active location and nearby results when browser location is requested', async () => {
    const { result } = renderLocation();
    await waitFor(() => expect(result.current.actualLocation?.latitude).toBe(10));
    await act(async () => expect(await result.current.requestCurrentLocation()).toBe(true));
    expect(result.current.location.latitude).toBe(0);
    expect(result.current.actualLocation.latitude).toBe(0);
    expect(result.current.actualLocation.source).toBe('browser');
  });

  it('preserves a searched destination while refreshing actual location', async () => {
    const search = { latitude: -30, longitude: 40, name: 'Chosen destination' };
    sessionStorage.setItem('starview_active_location', JSON.stringify({ data: search, source: 'search' }));
    permission.state = 'granted';
    const { result } = renderLocation();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.location).toEqual(search);
    expect(result.current.actualLocation.source).toBe('browser');
  });

  it('completes the current request when its permission prompt is granted', async () => {
    const { result } = renderLocation();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    geolocation.mockImplementation(resolve => {
      permission.state = 'granted';
      permission.dispatchEvent(new Event('change'));
      resolve({ coords: { latitude: 0, longitude: 0 } });
    });
    await act(async () => expect(await result.current.requestCurrentLocation()).toBe(true));
    expect(result.current.actualLocation.source).toBe('browser');
    expect(geolocation).toHaveBeenCalledOnce();
  });

  it('refreshes location on permission changes even in StrictMode', async () => {
    const { result } = renderLocation(true);
    await waitFor(() => expect(result.current.actualLocation?.source).toBe('ip'));
    act(() => { permission.state = 'granted'; permission.dispatchEvent(new Event('change')); });
    await waitFor(() => expect(result.current.actualLocation?.source).toBe('browser'));
    expect(result.current.location.latitude).toBe(0);
  });

  it('does not overwrite a search with a delayed detection response', async () => {
    let finishIP;
    api.get.mockImplementation(() => new Promise(resolve => { finishIP = resolve; }));
    const { result } = renderLocation();
    await waitFor(() => expect(finishIP).toBeDefined());
    act(() => result.current.setLocation(0, 45, 'Selected while loading'));
    await act(async () => finishIP({ data: ip }));
    expect(result.current.location.name).toBe('Selected while loading');
    expect(result.current.actualLocation.latitude).toBe(10);
  });
});
