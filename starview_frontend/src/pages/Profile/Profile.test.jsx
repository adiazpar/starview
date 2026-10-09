import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from './index';
import { useAuth } from '../../contexts/AuthContext';
import useProfileNavigation from '../../hooks/useProfileNavigation';
import common from '../../../public/locales/en/common.json';

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: key => key.split('.').reduce((value, part) => value?.[part], common) || key,
}) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useProfileNavigation', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useProfileData', () => ({ default: () => ({
  badgeData: null, pinnedBadges: [], socialAccounts: [], isLoading: false,
  refreshSocialAccounts: vi.fn(), pinnedBadgesHook: {},
}) }));
vi.mock('../../components/profile/ProfileHeader', () => ({ default: (props) => {
  return <h1>{props.user.username}</h1>;
} }));
vi.mock('../../components/profile/SettingsTab', () => ({ default: () => null }));
vi.mock('../../components/profile/BadgesTab', () => ({ default: () => null }));
vi.mock('../../components/profile/MyReviewsTab', () => ({ default: () => null }));
vi.mock('../../components/profile/FavoritesTab', () => ({ default: () => null }));

describe('account settings back control', () => {
  const goBack = vi.fn();
  const goToOwnProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, username: 'owner' }, refreshAuth: vi.fn(), loading: false });
    useProfileNavigation.mockReturnValue({ goBack, goToOwnProfile });
  });

  it('puts Back above the header and always returns to your own profile', () => {
    render(<MemoryRouter initialEntries={['/profile']}><Profile /></MemoryRouter>);

    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.compareDocumentPosition(screen.getByRole('heading', { name: 'owner' })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
    expect(useProfileNavigation).toHaveBeenCalledWith('owner');

    fireEvent.click(back);
    expect(goToOwnProfile).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();
  });

});
