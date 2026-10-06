import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SettingsTab from './index';
import common from '../../../../public/locales/en/common.json';

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: key => key.split('.').reduce((value, part) => value?.[part], common) || key,
}) }));
vi.mock('../ProfileSettings', () => ({ default: () => null }));
vi.mock('../PreferencesSection', () => ({ default: () => null }));
vi.mock('../ConnectedAccountsSection', () => ({ default: () => null }));
vi.mock('../AccountSecurityDialog', () => ({ default: () => <div role="dialog" aria-label="Security setup" /> }));

describe('account security entry point', () => {
  it.each([
    [false, 'Enable two-factor authentication', 'Manage two-factor authentication'],
    [true, 'Manage two-factor authentication', 'Enable two-factor authentication'],
  ])('reflects the account enabled setting (%s)', (enabled, action, absentAction) => {
    render(<MemoryRouter><SettingsTab user={{ id: 1, mfa_enabled: enabled }} /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account Security' }));
    expect(screen.queryByRole('button', { name: absentAction })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(screen.getByRole('dialog', { name: 'Security setup' })).toBeInTheDocument();
  });
});
