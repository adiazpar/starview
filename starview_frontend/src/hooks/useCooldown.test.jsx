import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCooldown, { RESEND_COOLDOWN_SECONDS, retryAfterSeconds } from './useCooldown';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const tick = () => act(() => { vi.advanceTimersByTime(1000); });

describe('useCooldown', () => {
  it('counts down once a second and stops at zero', () => {
    const { result } = renderHook(() => useCooldown());
    expect(result.current[0]).toBe(0);
    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    tick();
    expect(result.current[0]).toBe(1);
    tick();
    expect(result.current[0]).toBe(0);
    tick();
    expect(result.current[0]).toBe(0);
  });

  it('defaults to the resend window and can be cleared early', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(RESEND_COOLDOWN_SECONDS);
    act(() => result.current[1](0));
    expect(result.current[0]).toBe(0);
  });

  it('expires on return from a background tab even when timer callbacks were suspended', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current[1](60));
    vi.setSystemTime(Date.now() + 90_000);
    fireEvent.focus(window);
    expect(result.current[0]).toBe(0);
  });
});

describe('retryAfterSeconds', () => {
  it('rounds the server wait up and ignores missing or invalid values', () => {
    expect(retryAfterSeconds({ response: { data: { retry_after: 41.2 } } })).toBe(42);
    expect(retryAfterSeconds({ response: { data: { retry_after: null } } })).toBe(0);
    expect(retryAfterSeconds({ response: { data: { retry_after: 'soon' } } })).toBe(0);
    expect(retryAfterSeconds(new Error('offline'))).toBe(0);
  });
});
