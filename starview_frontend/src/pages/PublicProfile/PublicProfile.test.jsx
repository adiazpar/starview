import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicProfile from './index';
import { useAuth } from '../../contexts/AuthContext';
import { publicUserApi } from '../../services/profile';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/profile', () => ({ publicUserApi: {
  getUser: vi.fn(), getUserBadges: vi.fn(), getUserReviews: vi.fn(),
} }));
vi.mock('../../hooks/useShareLink', () => ({ default: () => vi.fn() }));
vi.mock('../../hooks/useSEO', () => ({ useSEO: () => {} }));
vi.mock('../../hooks/usePinnedBadges', () => ({ default: () => ({ updatePinnedBadgeIds: vi.fn() }) }));
vi.mock('../../components/profile/ProfileHeader', () => ({ default: ({ user }) => <h1>{user.username}</h1> }));
vi.mock('../../components/profile/ProfileStats', () => ({ default: () => null }));
vi.mock('../../components/badges/BadgeSection', () => ({ default: () => null }));

function ProfileRoute() {
  return <MemoryRouter initialEntries={['/users/stargazer']}>
    <Routes><Route path="/users/:username" element={<PublicProfile />} /></Routes>
  </MemoryRouter>;
}

describe('public profile refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicUserApi.getUser.mockResolvedValue({ data: { id: 1, username: 'stargazer' } });
    publicUserApi.getUserBadges.mockResolvedValue({ data: { earned: [], pinned_badge_ids: [] } });
    publicUserApi.getUserReviews.mockResolvedValue({ data: { results: [] } });
  });

  it.each([null, { id: 1, username: 'stargazer' }])('waits for initial session resolution (%j)', async (user) => {
    useAuth.mockReturnValue({ user: null, loading: true });
    const { rerender } = render(<ProfileRoute />);
    expect(publicUserApi.getUser).not.toHaveBeenCalled();
    expect(publicUserApi.getUserBadges).not.toHaveBeenCalled();

    useAuth.mockReturnValue({ user, loading: false });
    rerender(<ProfileRoute />);
    expect(await screen.findByRole('heading', { name: 'stargazer' })).toBeInTheDocument();
    await waitFor(() => expect(publicUserApi.getUserReviews).toHaveBeenCalledWith('stargazer', 1));
    expect(publicUserApi.getUser).toHaveBeenCalledOnce();
    expect(screen.queryByText('Failed to load profile')).not.toBeInTheDocument();
  });
});
