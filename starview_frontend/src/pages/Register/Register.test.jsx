import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './index';
import { authApi } from '../../services/auth';
import { english, pickDate, select, stubModalDialog } from '../../__tests__/birthDateTestUtils';

const navigate = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => english(key), i18n: { language: 'en' } }) }));
vi.mock('react-router-dom', async importOriginal => ({ ...(await importOriginal()), useNavigate: () => navigate }));
vi.mock('../../services/auth', () => ({ authApi: { register: vi.fn() } }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const account = {
  username: '', email: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace',
  password1: 'Orbit-Sky-42!', password2: 'Orbit-Sky-42!',
};
const field = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillForm = () => {
  field('First Name', account.first_name);
  field('Last Name', account.last_name);
  field('Email Address', account.email);
  field('Password', account.password1);
  field('Confirm Password', account.password2);
};
const createAccount = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
const birthdayControl = () => screen.getByRole('button', { name: /Date of birth \(Optional\)/ });
const button = name => screen.getByRole('button', { name });
const sentDate = call => authApi.register.mock.calls[call][0].birth_date;
const rejected = errors => ({ response: { data: { errors } } });
// The dialog closes once its owner has taken the date, a moment after the click.
async function chooseDate(parts, action = 'Save') {
  pickDate(parts);
  fireEvent.click(button(action));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  stubModalDialog();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 9, 12) });
  authApi.register.mockResolvedValue({ data: { requires_verification: true } });
  render(<MemoryRouter><RegisterPage /></MemoryRouter>);
});
afterEach(() => { vi.useRealTimers(); });

describe('the optional date of birth row', () => {
  it('is an optional, private control that opens the shared dialog and shows what was chosen', async () => {
    expect(screen.getByText('Only visible to you')).toBeInTheDocument();
    expect(birthdayControl()).toHaveTextContent('Select date');
    fireEvent.click(birthdayControl());
    expect(screen.getByRole('dialog', { name: 'Date of birth' })).toBeInTheDocument();
    // Editing the form's own draft is not a signup step: no Continue, and nothing to remove yet.
    expect(button('Save')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    await chooseDate({ month: 3, day: 14, year: 1990 });
    expect(birthdayControl()).toHaveTextContent('March 14, 1990');
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('reopens on the chosen date, and Remove clears it without asking again at signup', async () => {
    fireEvent.click(birthdayControl());
    await chooseDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(birthdayControl());
    expect(select('Month')).toHaveValue('3');
    expect(select('Year')).toHaveValue('1990');
    fireEvent.click(button('Remove'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(birthdayControl()).toHaveTextContent('Select date');
    fillForm();
    createAccount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(authApi.register).toHaveBeenCalledOnce());
    expect(authApi.register.mock.calls[0][0]).not.toHaveProperty('birth_date');
  });

  it('sends a date chosen there without asking again', async () => {
    fillForm();
    fireEvent.click(birthdayControl());
    await chooseDate({ month: 3, day: 14, year: 1990 });
    createAccount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(authApi.register).toHaveBeenCalledOnce());
    expect(authApi.register).toHaveBeenCalledWith({ ...account, birth_date: '1990-03-14' });
  });
});

describe('submitting without a date', () => {
  it('asks first and sends nothing, not even the passwords, until the person decides', () => {
    fillForm();
    createAccount();
    expect(screen.getByRole('dialog', { name: 'Date of birth' })).toBeInTheDocument();
    expect(button('Continue')).toBeDisabled();
    expect(button('Skip for now')).toBeEnabled();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('Continue registers with the chosen date, once, then moves on to verification', async () => {
    fillForm();
    createAccount();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(button('Continue'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/verify-email?email=ada%40example.test&from=register'));
    expect(authApi.register).toHaveBeenCalledOnce();
    expect(authApi.register).toHaveBeenCalledWith({ ...account, birth_date: '1990-03-14' });
  });

  it('Skip for now registers without any date', async () => {
    fillForm();
    createAccount();
    fireEvent.click(button('Skip for now'));
    await waitFor(() => expect(authApi.register).toHaveBeenCalledOnce());
    expect(authApi.register).toHaveBeenCalledWith(account);
    expect(authApi.register.mock.calls[0][0]).not.toHaveProperty('birth_date');
  });

  it('X returns to the form with every field kept, sends nothing, and asks again next time', () => {
    fillForm();
    createAccount();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(button('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Lovelace');
    expect(screen.getByLabelText('Email Address')).toHaveValue('ada@example.test');
    expect(screen.getByLabelText('Password')).toHaveValue(account.password1);
    expect(screen.getByLabelText('Confirm Password')).toHaveValue(account.password2);
    // The unconfirmed date is discarded, and leaving was not a decision.
    expect(birthdayControl()).toHaveTextContent('Select date');
    expect(authApi.register).not.toHaveBeenCalled();
    createAccount();
    expect(screen.getByRole('dialog', { name: 'Date of birth' })).toBeInTheDocument();
  });
});

describe('when registration is rejected', () => {
  it('keeps the confirmed date in the form and sends it again without asking', async () => {
    authApi.register.mockRejectedValueOnce(rejected({ email: ['A user with that email already exists.'] }));
    fillForm();
    createAccount();
    pickDate({ month: 3, day: 14, year: 1990 });
    fireEvent.click(button('Continue'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('A user with that email already exists.', 'error'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(birthdayControl()).toHaveTextContent('March 14, 1990');
    expect(screen.getByLabelText('Email Address')).toHaveValue('ada@example.test');
    createAccount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(2));
    expect(sentDate(1)).toBe('1990-03-14');
  });

  it('remembers a skip, so fixing the form does not ask again and still sends no date', async () => {
    authApi.register.mockRejectedValueOnce(rejected({ username: ['That username is taken.'] }));
    fillForm();
    createAccount();
    fireEvent.click(button('Skip for now'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('That username is taken.', 'error'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    createAccount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(2));
    expect(authApi.register.mock.calls[1][0]).not.toHaveProperty('birth_date');
  });

  it('marks a date the server rejected on its field, until a new one is chosen', async () => {
    authApi.register.mockRejectedValueOnce(rejected({ birth_date: ['Enter a date in 1900 or later.'] }));
    fillForm();
    fireEvent.click(birthdayControl());
    await chooseDate({ month: 3, day: 14, year: 1990 });
    createAccount();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Enter a date in 1900 or later.', 'error'));
    expect(birthdayControl()).toHaveClass('error');
    fireEvent.click(birthdayControl());
    await chooseDate({ year: 1991 });
    expect(birthdayControl()).not.toHaveClass('error');
    expect(birthdayControl()).toHaveTextContent('March 14, 1991');
  });
});
