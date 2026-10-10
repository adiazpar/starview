import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BirthDateOnboarding from './BirthDateOnboarding';
import profileApi from '../../services/profile';
import { english, pickDate, select, stubModalDialog } from '../../__tests__/birthDateTestUtils';

const auth = vi.hoisted(() => ({ user: null, refreshAuth: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => english(key), i18n: { language: 'en' } }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/profile', () => ({ default: { updateBirthDate: vi.fn(), dismissBirthDatePrompt: vi.fn() } }));

const newAccount = (extra = {}) => ({ id: 1, username: 'new_stargazer', birth_date: null, birth_date_prompt: true, ...extra });
const button = name => screen.getByRole('button', { name });
const dialog = () => screen.queryByRole('dialog', { name: 'Date of birth' });
const failure = new Error('Network Error');

function renderOnboarding(user = newAccount()) {
  auth.user = user;
  return render(<BirthDateOnboarding />);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.refreshAuth.mockResolvedValue();
  profileApi.updateBirthDate.mockResolvedValue({ data: { detail: 'Date of birth updated.', birth_date: '1990-03-14' } });
  profileApi.dismissBirthDatePrompt.mockResolvedValue({ data: { detail: 'Date of birth reminder dismissed.' } });
  stubModalDialog();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 9, 12) });
});
afterEach(() => { vi.useRealTimers(); });

describe('who is prompted', () => {
  it.each([
    ['signed out', null],
    ['an existing account the server did not flag', { id: 1, username: 'longtime' }],
    ['an account with the prompt switched off', { id: 1, username: 'longtime', birth_date_prompt: false }],
    ['an account that already has a date', { id: 1, birth_date: '1990-03-14', birth_date_prompt: false }],
  ])('never prompts %s', (_, user) => {
    renderOnboarding(user);
    expect(dialog()).not.toBeInTheDocument();
    expect(profileApi.updateBirthDate).not.toHaveBeenCalled();
    expect(profileApi.dismissBirthDatePrompt).not.toHaveBeenCalled();
  });

  it('prompts a newly created account when the server says so, with Save and Skip for now', () => {
    renderOnboarding();
    expect(dialog()).toBeInTheDocument();
    expect(button('Save')).toBeDisabled();
    expect(button('Skip for now')).toBeEnabled();
    expect(screen.getByText('Only visible to you')).toBeInTheDocument();
  });
});

describe('answering the prompt', () => {
  it('saves the date, refreshes the account once the dialog is done, and does not come back', async () => {
    const view = renderOnboarding();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(button('Save'));
    await waitFor(() => expect(auth.refreshAuth).toHaveBeenCalledOnce());
    expect(profileApi.updateBirthDate).toHaveBeenCalledWith({ birth_date: '1990-03-14' });
    expect(profileApi.dismissBirthDatePrompt).not.toHaveBeenCalled();
    expect(dialog()).not.toBeInTheDocument();
    // A refresh that still reports the prompt does not bring this account's dialog back.
    view.rerender(<BirthDateOnboarding />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('Skip for now tells the server, then refreshes, without saving a date', async () => {
    renderOnboarding();
    fireEvent.click(button('Skip for now'));
    await waitFor(() => expect(auth.refreshAuth).toHaveBeenCalledOnce());
    expect(profileApi.dismissBirthDatePrompt).toHaveBeenCalledOnce();
    expect(profileApi.updateBirthDate).not.toHaveBeenCalled();
    expect(dialog()).not.toBeInTheDocument();
  });

  it('X and Escape dismiss on the server too, so the prompt does not return on the next visit', async () => {
    const view = renderOnboarding();
    fireEvent.click(button('Close'));
    await waitFor(() => expect(auth.refreshAuth).toHaveBeenCalledOnce());
    expect(profileApi.dismissBirthDatePrompt).toHaveBeenCalledOnce();
    expect(dialog()).not.toBeInTheDocument();
    view.unmount();

    vi.clearAllMocks();
    renderOnboarding(newAccount({ id: 2 }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(profileApi.dismissBirthDatePrompt).toHaveBeenCalledOnce());
  });

  it('keeps a failed save open with the reason, and neither dismisses nor refreshes', async () => {
    profileApi.updateBirthDate.mockRejectedValueOnce(Object.assign(new Error('Request failed'), {
      response: { data: { errors: { birth_date: ['Date of birth cannot be in the future.'] } } },
    }));
    renderOnboarding();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(button('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Date of birth cannot be in the future.');
    expect(dialog()).toBeInTheDocument();
    expect(select('Year')).toHaveValue('1990');
    expect(auth.refreshAuth).not.toHaveBeenCalled();
    expect(profileApi.dismissBirthDatePrompt).not.toHaveBeenCalled();
  });
});

describe('a dismissal the server did not record', () => {
  it('stays open when Skip fails, says so without claiming anything was saved, and can be retried', async () => {
    profileApi.dismissBirthDatePrompt.mockRejectedValueOnce(failure);
    renderOnboarding();
    fireEvent.click(button('Skip for now'));
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t update your choice. Please try again.');
    expect(dialog()).toBeInTheDocument();
    expect(screen.queryByText(/saved|updated/i, { selector: '[role="status"]' })).not.toBeInTheDocument();
    expect(auth.refreshAuth).not.toHaveBeenCalled();
    fireEvent.click(button('Skip for now'));
    await waitFor(() => expect(auth.refreshAuth).toHaveBeenCalledOnce());
    expect(profileApi.dismissBirthDatePrompt).toHaveBeenCalledTimes(2);
    expect(dialog()).not.toBeInTheDocument();
  });

  it('brings the prompt back with the reason when an X or Escape dismissal fails, and can be retried', async () => {
    profileApi.dismissBirthDatePrompt.mockRejectedValueOnce(failure);
    renderOnboarding();
    fireEvent.click(button('Close'));
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t update your choice. Please try again.');
    expect(dialog()).toBeInTheDocument();
    expect(auth.refreshAuth).not.toHaveBeenCalled();
    fireEvent.click(button('Skip for now'));
    await waitFor(() => expect(auth.refreshAuth).toHaveBeenCalledOnce());
    expect(dialog()).not.toBeInTheDocument();
  });
});

describe('staying put', () => {
  it('keeps the dialog and what is typed through ordinary auth refreshes, which hand over a new user object', () => {
    const view = renderOnboarding();
    const open = screen.getByRole('dialog');
    pickDate({ month: 3, day: 14, year: 1990 });
    auth.user = { ...auth.user, username: 'renamed' };
    view.rerender(<BirthDateOnboarding />);
    expect(screen.getByRole('dialog')).toBe(open);
    expect(select('Month')).toHaveValue('3');
    expect(select('Day')).toHaveValue('14');
    expect(select('Year')).toHaveValue('1990');
  });

  it('drops the draft when the account changes, and prompts the next account only if the server says so', () => {
    const view = renderOnboarding();
    pickDate({ month: 3, day: 14, year: 1990 });
    auth.user = newAccount({ id: 2 });
    view.rerender(<BirthDateOnboarding />);
    expect(select('Month')).toHaveValue('');
    expect(select('Year')).toHaveValue('');
    auth.user = { id: 3, username: 'longtime' };
    view.rerender(<BirthDateOnboarding />);
    expect(dialog()).not.toBeInTheDocument();
  });
});
