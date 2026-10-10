import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Switch from './index';

function renderSwitch(props = {}) {
  const onChange = vi.fn();
  render(<Switch checked={false} onChange={onChange} aria-label="Notifications" {...props} />);
  return { onChange, control: screen.getByRole('switch', { name: 'Notifications' }) };
}

describe('state', () => {
  it.each([true, false])('shows checked=%s and leaves changing it to its owner', checked => {
    const { control } = renderSwitch({ checked });
    expect(control).toHaveAttribute('aria-checked', String(checked));
    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-checked', String(checked));
  });
});

describe('toggling', () => {
  it.each([
    [false, true],
    [true, false],
  ])('asks for the opposite when it is %s', (checked, requested) => {
    const { onChange, control } = renderSwitch({ checked });
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(requested);
  });

  it('is a focusable button, so Space and Enter work', () => {
    const { control } = renderSwitch();
    control.focus();
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('type', 'button');
  });
});

describe('while busy', () => {
  it('ignores toggles and is announced as disabled and busy', () => {
    const { onChange, control } = renderSwitch({ busy: true });
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps keyboard focus, which the disabled attribute would drop', () => {
    const { control } = renderSwitch({ busy: true });
    control.focus();
    expect(control).toHaveFocus();
    expect(control).not.toBeDisabled();
  });

  it('is announced as neither otherwise', () => {
    const { control } = renderSwitch();
    expect(control).not.toHaveAttribute('aria-disabled');
    expect(control).not.toHaveAttribute('aria-busy');
  });
});
