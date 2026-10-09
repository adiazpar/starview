import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from './index';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useIsDesktop: () => false }));
vi.mock('../../hooks/useExploreFilters', () => ({ useExploreFilters: () => ({
  filters: { search: '', types: [], minRating: null },
  setSearch: vi.fn(), setVerified: vi.fn(), activeFilterCount: 0,
}) }));
vi.mock('../../contexts/NavbarExtensionContext', () => ({ useNavbarExtension: () => ({}) }));

describe('fixed navbar layout', () => {
  let height;
  let notifyResize;
  let disconnect;
  const reservedHeight = () => document.documentElement.style.getPropertyValue('--navbar-total-height');

  beforeEach(() => {
    height = 65;
    disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { notifyResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('--navbar-total-height');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reserves the measured header space before sibling layout effects run', () => {
    let initialOffset;
    function Content() {
      useLayoutEffect(() => { initialOffset = reservedHeight(); }, []);
      return <main />;
    }
    render(<MemoryRouter><Navbar /><Content /></MemoryRouter>);
    expect(initialOffset).toBe('65px');
  });

  it('preserves spacing while hidden, then follows the visible header size', () => {
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    height = 0;
    act(() => notifyResize());
    expect(reservedHeight()).toBe('65px');
    height = 123;
    act(() => notifyResize());
    expect(reservedHeight()).toBe('123px');
  });

  it('disconnects the old measurement when the shell unmounts', () => {
    const { unmount } = render(<MemoryRouter><Navbar /></MemoryRouter>);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
