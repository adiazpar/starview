import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BirthDateForm from './index';
import profileApi from '../../../../services/profile';
import { english, pickDate, select, stubModalDialog } from '../../../../__tests__/birthDateTestUtils';

const language = vi.hoisted(() => ({ current: 'en' }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => english(key), i18n: { language: language.current } }),
}));
vi.mock('../../../../services/profile', () => ({ default: { updateBirthDate: vi.fn() } }));
vi.mock('../../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const user = { id: 7, birth_date: '1990-03-14' };
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit date of birth' }));
const saveButton = () => screen.getByRole('button', { name: 'Save' });

function renderForm({ account = user, refreshAuth = vi.fn().mockResolvedValue() } = {}) {
  const view = render(<BirthDateForm user={account} refreshAuth={refreshAuth} />);
  return { refreshAuth, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  language.current = 'en';
  stubModalDialog();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 9, 12) });
  profileApi.updateBirthDate.mockResolvedValue({ data: { detail: 'Date of birth updated.', birth_date: '1991-04-02' } });
});
afterEach(() => { vi.useRealTimers(); });

describe('showing the date', () => {
  it('matches the other profile forms: a titled section with a pencil and the value beneath', () => {
    const { view } = renderForm();
    expect(view.container.querySelector('.profile-form-section .profile-form-header .profile-form-title'))
      .toHaveTextContent('Date of birth');
    expect(screen.getByText('Only visible to you')).toBeInTheDocument();
    const pencil = screen.getByRole('button', { name: 'Edit date of birth' });
    expect(pencil).toHaveClass('profile-edit-btn');
    expect(pencil.querySelector('i')).toHaveClass('fa-pencil');
    expect(view.container.querySelector('.profile-view-value')).toHaveTextContent('March 14, 1990');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('formats the date in the reader language without shifting the day', () => {
    language.current = 'de';
    renderForm();
    expect(screen.getByText('14. März 1990')).toBeInTheDocument();
  });

  it.each([null, undefined, ''])('says Not set when the date is %j', value => {
    const { view } = renderForm({ account: { id: 7, birth_date: value } });
    expect(screen.getByText('Not set')).toHaveClass('profile-view-value--empty');
    expect(view.container.querySelector('.profile-view-value')).toBeTruthy();
  });

  it('follows the account the page was given, not a copy of it', () => {
    const { view, refreshAuth } = renderForm();
    view.rerender(<BirthDateForm user={{ ...user, birth_date: '1991-04-02' }} refreshAuth={refreshAuth} />);
    expect(screen.getByText('April 2, 1991')).toBeInTheDocument();
  });
});

describe('editing', () => {
  it('opens the shared dialog on the saved date', () => {
    renderForm();
    edit();
    expect(screen.getByRole('dialog', { name: 'Date of birth' })).toBeInTheDocument();
    expect(select('Month')).toHaveValue('3');
    expect(select('Day')).toHaveValue('14');
    expect(select('Year')).toHaveValue('1990');
  });

  it('starts blank when there is no date yet', () => {
    renderForm({ account: { id: 7, birth_date: null } });
    edit();
    expect(select('Month')).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });

  it('saves, waits for the refreshed account, then closes and confirms', async () => {
    let finishRefresh;
    const refreshAuth = vi.fn(() => new Promise(resolve => { finishRefresh = resolve; }));
    renderForm({ refreshAuth });
    edit();
    pickDate({ month: 4, day: 2, year: 1991 });
    fireEvent.click(saveButton());
    await waitFor(() => expect(refreshAuth).toHaveBeenCalledOnce());
    expect(profileApi.updateBirthDate).toHaveBeenCalledWith({ birth_date: '1991-04-02' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => finishRefresh());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith('Date of birth updated', 'success');
  });

  it('keeps the existing date, shows the reason and does not refresh when saving fails', async () => {
    profileApi.updateBirthDate.mockRejectedValue(Object.assign(new Error('Request failed'), {
      response: { data: { detail: 'Invalid input.', errors: { birth_date: ['Date of birth cannot be in the future.'] } } },
    }));
    const { refreshAuth } = renderForm();
    edit();
    pickDate({ month: 4, day: 2, year: 1991 });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Date of birth cannot be in the future.');
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('March 14, 1990')).toBeInTheDocument();
  });

  it('cancels from the X without a request, and a later edit starts from the saved date, not the draft', () => {
    renderForm();
    edit();
    pickDate({ month: 12, day: 25, year: 1980 });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(profileApi.updateBirthDate).not.toHaveBeenCalled();
    expect(screen.getByText('March 14, 1990')).toBeInTheDocument();
    edit();
    expect(select('Month')).toHaveValue('3');
    expect(select('Day')).toHaveValue('14');
    expect(select('Year')).toHaveValue('1990');
  });
});
