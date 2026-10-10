import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BirthDateDialog from './BirthDateDialog';
import { english, pickDate, select, stubModalDialog } from '../../__tests__/birthDateTestUtils';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => english(key), i18n: { language: 'en' } }) }));

beforeEach(() => {
  stubModalDialog();
  // 9 October 2026 on the local calendar. Only Date is faked, so request promises still settle.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 9, 12) });
});
afterEach(() => { vi.useRealTimers(); });

const save = () => screen.getByRole('button', { name: 'Save' });
const close = () => screen.getByRole('button', { name: 'Close' });
const optionTexts = name => Array.from(select(name).options).filter(option => !option.hidden).map(option => option.textContent);
const rejection = (data, extra = {}) => Object.assign(new Error('Request failed'), { response: { data }, ...extra });

function renderDialog({ onSubmit = vi.fn().mockResolvedValue(), onClose = vi.fn(), ...props } = {}) {
  const view = render(<BirthDateDialog onSubmit={onSubmit} onClose={onClose} {...props} />);
  return { onSubmit, onClose, view };
}

describe('choosing a date', () => {
  it('offers every month and every year from 1900 through this year, with no minimum age', () => {
    renderDialog();
    expect(optionTexts('Month')).toEqual(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December']);
    const years = optionTexts('Year');
    expect(years[0]).toBe('2026');
    expect(years.at(-1)).toBe('1900');
    expect(years).toHaveLength(127);
    expect(optionTexts('Day')).toHaveLength(31);
    expect(screen.getByText('Only visible to you')).toBeInTheDocument();
  });

  it('keeps the primary action disabled until all three parts are chosen', () => {
    renderDialog();
    expect(save()).toBeDisabled();
    pickDate({ month: 3, day: 14 });
    expect(save()).toBeDisabled();
    pickDate({ year: 1990 });
    expect(save()).toBeEnabled();
  });

  it('submits the date as a plain YYYY-MM-DD string and closes once it is saved', async () => {
    const { onSubmit, onClose } = renderDialog();
    pickDate({ month: 1, day: 5, year: 2001 });
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved'));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith('2001-01-05');
  });

  it('uses the owner label for the primary action', () => {
    renderDialog({ submitLabel: 'Continue' });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('the calendar', () => {
  it('limits the days to the month and offers February 29 only in leap years', () => {
    renderDialog();
    pickDate({ month: 4 });
    expect(optionTexts('Day')).toHaveLength(30);
    pickDate({ month: 1 });
    expect(optionTexts('Day')).toHaveLength(31);
    pickDate({ month: 2 });
    expect(optionTexts('Day')).toHaveLength(29);
    pickDate({ year: 2023 });
    expect(optionTexts('Day')).toHaveLength(28);
    pickDate({ year: 2024 });
    expect(optionTexts('Day')).toHaveLength(29);
    pickDate({ year: 1900 });
    expect(optionTexts('Day')).toHaveLength(28);
    pickDate({ year: 2000 });
    expect(optionTexts('Day')).toHaveLength(29);
  });

  it('saves a leap day', async () => {
    const { onSubmit } = renderDialog();
    pickDate({ month: 2, day: 29, year: 2024 });
    fireEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('2024-02-29'));
  });

  it('clears a day that a new month or year does not have, rather than moving it to another date', () => {
    renderDialog();
    pickDate({ month: 2, day: 29, year: 2024 });
    expect(save()).toBeEnabled();
    pickDate({ year: 2023 });
    expect(select('Day')).toHaveValue('');
    expect(save()).toBeDisabled();
    pickDate({ month: 1, day: 31 });
    expect(save()).toBeEnabled();
    pickDate({ month: 4 });
    expect(select('Day')).toHaveValue('');
    expect(save()).toBeDisabled();
  });

  it('refuses a date in the future and says why, but accepts today', async () => {
    const { onSubmit } = renderDialog();
    pickDate({ month: 10, day: 10, year: 2026 });
    expect(screen.getByRole('alert')).toHaveTextContent('Date of birth can’t be in the future.');
    expect(select('Day')).toBeInvalid();
    expect(save()).toBeDisabled();
    pickDate({ month: 11, day: 1 });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    pickDate({ month: 10, day: 9 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(select('Day')).toBeValid();
    fireEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('2026-10-09'));
  });

  it('does not submit an unfinished or future date even when the form itself is submitted', () => {
    const { onSubmit } = renderDialog();
    const form = screen.getByRole('group', { name: 'Date of birth' }).closest('form');
    fireEvent.submit(form);
    pickDate({ month: 12, day: 31, year: 2026 });
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('starting values', () => {
  it('starts from the saved date', () => {
    renderDialog({ initialValue: '1990-03-14' });
    expect(select('Month')).toHaveValue('3');
    expect(select('Day')).toHaveValue('14');
    expect(select('Year')).toHaveValue('1990');
    expect(save()).toBeEnabled();
  });

  it.each(['', null, undefined, 'not a date', '2023-02-29', '1850-01-01', '2999-01-01'])(
    'starts blank when the value is %j', value => {
      renderDialog({ initialValue: value });
      expect(select('Month')).toHaveValue('');
      expect(select('Day')).toHaveValue('');
      expect(select('Year')).toHaveValue('');
      expect(save()).toBeDisabled();
    });

  it('shows a reason handed in by an owner that reopened it, without moving focus off the title', () => {
    renderDialog({ initialError: 'We couldn’t update your choice. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t update your choice');
    expect(screen.getByRole('heading', { name: 'Date of birth' })).toHaveFocus();
  });
});

describe('saving', () => {
  it('is busy while the request runs, cannot be dismissed or sent twice, then closes', async () => {
    let finish;
    const onSubmit = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { onClose } = renderDialog({ onSubmit });
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(save());
    expect(save()).toBeDisabled();
    expect(select('Month')).toBeDisabled();
    expect(close()).toBeDisabled();
    fireEvent.click(save());
    fireEvent.submit(screen.getByRole('group', { name: 'Date of birth' }).closest('form'));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith('saved');
  });

  it('keeps the dialog, the draft and the server reason when saving fails, and lets the person retry', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(rejection({ detail: 'Invalid input.', errors: { birth_date: ['Enter a date in 1900 or later.'] } }))
      .mockResolvedValueOnce();
    const { onClose } = renderDialog({ onSubmit });
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a date in 1900 or later.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(select('Month')).toHaveValue('3');
    expect(select('Day')).toHaveValue('14');
    expect(select('Year')).toHaveValue('1990');
    expect(save()).toBeEnabled();
    expect(save()).toHaveFocus();
    // Changing the date retires a reason that no longer describes it.
    pickDate({ day: 15 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved'));
    expect(onSubmit).toHaveBeenNthCalledWith(2, '1990-03-15');
  });

  it('falls back to its own wording when the server gave no reason', async () => {
    const { onClose } = renderDialog({ onSubmit: vi.fn().mockRejectedValue(new Error('Network Error')) });
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t save your date of birth. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows no message for a request that was cancelled by an account change or an expired session', async () => {
    const cancelled = Object.assign(new Error('Account changed'), { code: 'ERR_CANCELED' });
    const onSubmit = vi.fn().mockRejectedValue(cancelled);
    const { onClose } = renderDialog({ onSubmit });
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(save()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not report a result after the dialog is gone', async () => {
    let finish;
    const { onClose, view } = renderDialog({ onSubmit: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(save());
    view.unmount();
    await act(async () => finish());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('leaving', () => {
  it('closes from the X without saving anything', () => {
    const { onSubmit, onClose } = renderDialog();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(close());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes on Escape the same way', () => {
    const { onClose } = renderDialog();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledWith('dismissed');
  });

  it('offers no back arrow and no Cancel beside the primary action', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('discards the draft when the dialog closes', () => {
    function Owner() {
      const [open, setOpen] = useState(true);
      return open
        ? <BirthDateDialog onSubmit={vi.fn()} onClose={() => setOpen(false)} />
        : <button onClick={() => setOpen(true)}>Reopen</button>;
    }
    render(<Owner />);
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(close());
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(select('Month')).toHaveValue('');
    expect(select('Year')).toHaveValue('');
  });
});

describe('the secondary action', () => {
  it('is only offered when the owner supplies one', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });

  it('leaves the date out and closes as skipped, without needing a date', async () => {
    const onSkip = vi.fn().mockResolvedValue();
    const { onSubmit, onClose } = renderDialog({ onSkip });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('skipped'));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('takes the owner label', () => {
    renderDialog({ onSkip: vi.fn(), skipLabel: 'Remove' });
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('shows its own failure, stays open and returns focus to it so the person can try again', async () => {
    const onSkip = vi.fn().mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce();
    const { onClose } = renderDialog({ onSkip });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t update your choice. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('skipped'));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });
});
