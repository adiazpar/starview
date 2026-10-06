import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VerificationLead, VerificationStatus } from './VerificationFeedback';

// The sentence places {{email}} itself; the lead emphasizes whatever lands there.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, values) => values?.email ? `We sent a code to ${values.email}, thanks.` : key }),
}));

describe('verification feedback', () => {
  it('emphasizes the destination wherever the translated sentence puts it', () => {
    render(<VerificationLead i18nKey="sent" email="alex@example.test" />);
    expect(screen.getByText('alex@example.test').tagName).toBe('STRONG');
    expect(screen.getByText(/We sent a code to/).textContent).toBe('We sent a code to alex@example.test, thanks.');
  });

  it('renders plain copy when there is no destination', () => {
    render(<VerificationLead i18nKey="plain.copy" />);
    expect(screen.getByText('plain.copy').tagName).toBe('P');
    expect(document.querySelector('strong')).toBeNull();
  });

  it('announces success politely and rejections immediately', () => {
    render(<>
      <VerificationStatus>Saved</VerificationStatus>
      <VerificationStatus tone="error">Not accepted</VerificationStatus>
    </>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Not accepted');
  });
});
