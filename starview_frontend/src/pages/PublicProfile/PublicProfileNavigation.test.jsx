import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicProfile from './index';
import { useAuth } from '../../contexts/AuthContext';
import useProfileNavigation from '../../hooks/useProfileNavigation';
import { publicUserApi } from '../../services/profile';
import common from '../../../public/locales/en/common.json';

const { shareLink } = vi.hoisted(() => ({ shareLink: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: key => key.split('.').reduce((value, part) => value?.[part], common) || key,
}) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/useProfileNavigation', () => ({ default: vi.fn() }));
vi.mock('../../services/profile', () => ({ publicUserApi: {
  getUser: vi.fn(), getUserBadges: vi.fn(), getUserReviews: vi.fn(),
} }));
vi.mock('../../hooks/useShareLink', () => ({ default: () => shareLink }));
vi.mock('../../hooks/useSEO', () => ({ useSEO: () => {} }));
vi.mock('../../hooks/usePinnedBadges', () => ({ default: () => ({ updatePinnedBadgeIds: vi.fn() }) }));
vi.mock('../../components/profile/ProfileHeader', () => ({ default: ({ user }) => <h1>{user.username}</h1> }));
vi.mock('../../components/profile/ProfileStats', () => ({ default: () => null }));
vi.mock('../../components/badges/BadgeSection', () => ({ default: () => null }));

function renderProfile(username) {
  return render(<MemoryRouter initialEntries={[`/users/${username}`]}>
    <Routes><Route path="/users/:username" element={<PublicProfile />} /></Routes>
  </MemoryRouter>);
}

describe('public profile back control', () => {
  const goBack = vi.fn();
  const goToOwnProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useProfileNavigation.mockReturnValue({ goBack, goToOwnProfile });
    publicUserApi.getUser.mockImplementation(async (username) => ({ data: { id: 1, username } }));
    publicUserApi.getUserBadges.mockResolvedValue({ data: { earned: [], pinned_badge_ids: [] } });
    publicUserApi.getUserReviews.mockResolvedValue({ data: { results: [] } });
  });

  it("puts Back above another user's header and navigates with the history back action", async () => {
    useAuth.mockReturnValue({ user: { id: 2, username: 'viewer' }, loading: false });
    renderProfile('stargazer');

    const heading = await screen.findByRole('heading', { name: 'stargazer' });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
    expect(useProfileNavigation).toHaveBeenCalledWith('viewer');

    fireEvent.click(back);
    expect(goBack).toHaveBeenCalledOnce();
    expect(goToOwnProfile).not.toHaveBeenCalled();
  });

  it('offers Back to signed-out visitors too', async () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderProfile('stargazer');

    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(useProfileNavigation).toHaveBeenCalledWith(undefined);
  });

  it('shares the visited public profile rather than settings or query parameters', async () => {
    useAuth.mockReturnValue({ user: { username: 'viewer' }, loading: false });
    renderProfile('stargazer?from=search');

    fireEvent.click(await screen.findByRole('button', { name: 'Share', exact: true }));
    expect(shareLink).toHaveBeenCalledWith({
      title: 'stargazer (@stargazer) | Starview',
      url: new URL('/users/stargazer', window.location.origin).href,
    });
  });

  it('leaves your own public profile without a toolbar', async () => {
    useAuth.mockReturnValue({ user: { id: 1, username: 'stargazer' }, loading: false });
    renderProfile('stargazer');

    await screen.findByRole('heading', { name: 'stargazer' });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share', exact: true })).not.toBeInTheDocument();
  });
});
