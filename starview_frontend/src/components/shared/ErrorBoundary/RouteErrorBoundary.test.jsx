import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteErrorBoundary from './RouteErrorBoundary';

function BrokenPage() {
  throw new Error('Map module failed to load');
}

function HealthyPage() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}

function renderRoutes(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <nav>
        <Link to="/explore">Explore</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/profile?tab=badges">Badges</Link>
      </nav>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/explore" element={<BrokenPage />} />
          <Route path="/profile" element={<HealthyPage />} />
        </Routes>
      </RouteErrorBoundary>
    </MemoryRouter>,
  );
}

describe('route error recovery', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('lets navigation leave a failed page without refreshing the browser', () => {
    renderRoutes('/explore');
    expect(screen.getByRole('heading', { name: /Houston/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Houston/ })).not.toBeInTheDocument();

    // Revisiting the broken route can fail again without poisoning the next one.
    fireEvent.click(screen.getByRole('link', { name: 'Explore' }));
    expect(screen.getByRole('heading', { name: /Houston/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeInTheDocument();
  });

  it('preserves healthy page state when only query parameters change', () => {
    renderRoutes('/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Count: 0' }));
    fireEvent.click(screen.getByRole('link', { name: 'Badges' }));
    expect(screen.getByRole('button', { name: 'Count: 1' })).toBeInTheDocument();
  });
});
