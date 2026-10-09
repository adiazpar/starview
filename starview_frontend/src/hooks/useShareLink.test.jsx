import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useShareLink from './useShareLink';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

const data = { title: 'Stella (@stella) | Starview', url: 'https://starview.app/users/stella' };

describe('sharing public links', () => {
  let copy;
  beforeEach(() => {
    vi.clearAllMocks();
    copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses native sharing even when the optional canShare API is absent', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(navigator.share).toHaveBeenCalledWith(data);
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the public link when native sharing is unavailable', async () => {
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(copy).toHaveBeenCalledWith(data.url);
    expect(showToast).toHaveBeenCalledWith('sharing.linkCopied', 'success');
  });

  it('copies the link if the device cannot share the payload', async () => {
    navigator.share = vi.fn();
    navigator.canShare = vi.fn().mockReturnValue(false);
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(navigator.share).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith(data.url);
  });

  it('respects cancelling the native share sheet', async () => {
    navigator.share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(copy).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('falls back to copy when native sharing fails', async () => {
    navigator.share = vi.fn().mockRejectedValue(new Error('Native sharing failed'));
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(copy).toHaveBeenCalledWith(data.url);
  });

  it('reports a copy failure without claiming success', async () => {
    copy.mockRejectedValue(new Error('Clipboard denied'));
    const { result } = renderHook(useShareLink);
    await act(() => result.current(data));
    expect(showToast).toHaveBeenCalledExactlyOnceWith('sharing.failed', 'error');
  });
});
