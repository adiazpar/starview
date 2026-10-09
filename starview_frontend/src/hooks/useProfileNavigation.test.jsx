import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import useProfileNavigation from './useProfileNavigation';

function NavigationFixture() {
  const location = useLocation();
  const { goBack, goToOwnProfile } = useProfileNavigation('owner');
  return <>
    <output data-testid="route">{location.pathname}{location.search}{location.hash}</output>
    <Link to="/users/alice">Alice</Link>
    <Link to="/users/bob">Bob</Link>
    <Link to="/profile">Settings</Link>
    <button onClick={goBack}>Back</button>
    <button onClick={goToOwnProfile}>Back to my profile</button>
  </>;
}

function startAt(path, state = { idx: 0 }) {
  window.history.replaceState(state, '', path);
  return render(<BrowserRouter><NavigationFixture /></BrowserRouter>);
}

async function expectRoute(path) {
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(path));
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(path);
}

describe('profile navigation', () => {
  beforeEach(() => window.history.replaceState({ idx: 0 }, '', '/'));

  it('unwinds a stack of profiles back to the original page without bouncing', async () => {
    startAt('/explore?sort=rating#results');
    fireEvent.click(screen.getByRole('link', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('link', { name: 'Bob' }));
    await expectRoute('/users/bob');

    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await expectRoute('/users/alice');
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await expectRoute('/explore?sort=rating#results');
    expect(window.history.state.idx).toBe(0);
  });

  it('still goes back after remounting on a profile (page refresh)', async () => {
    const view = startAt('/locations/42');
    fireEvent.click(screen.getByRole('link', { name: 'Alice' }));
    view.unmount();
    render(<BrowserRouter><NavigationFixture /></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await expectRoute('/locations/42');
  });

  it.each([{ idx: 0 }, null])('replaces direct-entry profiles with Home (%j)', async (state) => {
    startAt('/users/alice', state);
    const length = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await expectRoute('/');
    expect(window.history.length).toBe(length);
    expect(window.history.state.idx).toBe(0);
  });

  it('does not mistake forward entries for a previous app page', async () => {
    startAt('/users/alice');
    fireEvent.click(screen.getByRole('link', { name: 'Bob' }));
    await act(async () => window.history.back());
    await expectRoute('/users/alice');
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    await expectRoute('/');
  });

  it('returns settings to the owner even when opened from another profile', async () => {
    startAt('/users/alice');
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to my profile' }));
    await expectRoute('/users/owner');
    await act(async () => window.history.back());
    await expectRoute('/users/alice');
  });

  it('returns directly opened settings to the owner without adding history', async () => {
    startAt('/profile');
    const length = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Back to my profile' }));
    await expectRoute('/users/owner');
    expect(window.history.length).toBe(length);
  });
});
