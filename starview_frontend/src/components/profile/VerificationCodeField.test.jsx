import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerificationCodeField from './VerificationCodeField';

function Field({ initial = '', ...props }) {
  const [value, setValue] = useState(initial);
  return <VerificationCodeField id="code" label="Confirmation code" value={value} onChange={setValue} {...props} />;
}
const field = () => screen.getByLabelText('Confirmation code');
const boxes = () => Array.from(document.querySelectorAll('.verification-code-slot'));
const digits = () => boxes().map(box => box.textContent).join('');
const activeBox = () => boxes().findIndex(box => box.hasAttribute('data-active'));

// The browser describes each edit before making it; the field applies it itself so the caret stays where the edit leaves it.
const edit = (inputType, data = null) => {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  fireEvent(field(), event);
  return event;
};
const type = digit => edit('insertText', digit);
const backspace = () => edit('deleteContentBackward');
const forwardDelete = () => edit('deleteContentForward');
const focusField = () => act(() => field().focus());
const moveCaret = (start, end = start) => {
  focusField();
  field().setSelectionRange(start, end);
  fireEvent.keyUp(field(), { key: 'ArrowLeft' });
};
const paste = text => fireEvent.paste(field(), { clipboardData: { getData: () => text } });

afterEach(() => vi.unstubAllGlobals());

describe('verification code field', () => {
  it('is one labelled input for a numeric one-time code, drawn over six boxes assistive technology skips', () => {
    const { container } = render(<Field />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(container.querySelectorAll('input, button, select, textarea, [tabindex]')).toHaveLength(1);
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field()).toHaveAttribute('autocapitalize', 'off');
    expect(field()).toHaveAttribute('pattern', '[0-9]{6}');
    expect(boxes()).toHaveLength(6);
    expect(boxes()[0].closest('[aria-hidden="true"]')).not.toBeNull();
    expect(boxes().every(box => box.closest('[aria-hidden="true"]'))).toBe(true);
  });

  it('turns pasted or autofilled text into the six digits', () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: '123 456' } });
    expect(field()).toHaveValue('123456');
    fireEvent.change(field(), { target: { value: '654-321' } });
    expect(field()).toHaveValue('654321');
  });

  it('drops letters and anything past six digits', () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: 'a1b2c3d4e5f6g7h8' } });
    expect(field()).toHaveValue('123456');
  });

  it('keeps a longer recovery code a single plain field with no boxes', () => {
    render(<Field backup />);
    expect(boxes()).toHaveLength(0);
    fireEvent.change(field(), { target: { value: '1234 5678 90' } });
    expect(field()).toHaveValue('1234567890');
    expect(field()).not.toHaveAttribute('pattern');
  });

  it('reports a rejected value and the message it points at, on the input and on the boxes', () => {
    render(<Field invalid describedBy="why" disabled />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'why');
    expect(field()).toBeDisabled();
    expect(document.querySelector('.verification-code-boxes')).toHaveAttribute('data-invalid');
    expect(document.querySelector('.verification-code-boxes')).toHaveAttribute('data-disabled');
  });

  it('hands its input to a ref so owners can refocus it after a rejection', () => {
    const ref = { current: null };
    render(<Field ref={ref} />);
    expect(ref.current).toBe(field());
  });

  it('also works with a callback ref and with autoFocus (the first focus arrives before the ref is attached)', () => {
    let node = null;
    render(<Field ref={element => { node = element; }} autoFocus />);
    expect(node).toBe(field());
    expect(field()).toHaveFocus();
    expect(activeBox()).toBe(0);
  });
});

describe('typing into the boxes', () => {
  it('puts each digit in its own box, keeps leading zeros, and ignores everything else', () => {
    render(<Field />);
    moveCaret(0);
    expect(type('0').defaultPrevented).toBe(true);
    type('1');
    expect(type('x').defaultPrevented).toBe(true);
    type('2');
    expect(field()).toHaveValue('012');
    expect(digits()).toBe('012');
    expect(field().selectionStart).toBe(3);
  });

  it('highlights the box where the next digit goes, with a caret while it is empty', () => {
    render(<Field />);
    moveCaret(0);
    expect(activeBox()).toBe(0);
    expect(boxes()[0]).toHaveAttribute('data-caret');
    type('1');
    expect(activeBox()).toBe(1);
    expect(boxes()[1]).toHaveAttribute('data-caret');
    expect(boxes()[0]).toHaveAttribute('data-filled');
    '23456'.split('').forEach(type);
    expect(field()).toHaveValue('123456');
    expect(activeBox()).toBe(5);
    expect(boxes()[5]).not.toHaveAttribute('data-caret');
  });

  it('shows nothing as current while the field is not focused', () => {
    render(<Field initial="123" />);
    expect(activeBox()).toBe(-1);
    expect(document.querySelector('[data-caret]')).toBeNull();
  });

  it('corrects a digit by moving to its box and typing over it, leaving the caret in the next box', () => {
    render(<Field initial="123456" />);
    moveCaret(2);
    expect(activeBox()).toBe(2);
    type('9');
    expect(field()).toHaveValue('129456');
    expect(field().selectionStart).toBe(3);
    expect(activeBox()).toBe(3);
    type('8');
    expect(field()).toHaveValue('129856');
    expect(field().selectionStart).toBe(4);
  });

  it('overwrites the digit at a mid-code caret instead of shifting the rest right, even when the code is not full', () => {
    render(<Field initial="12" />);
    moveCaret(0);
    type('9');
    expect(field()).toHaveValue('92');
  });

  it('replaces the last digit when the code is full and the caret is at its end', () => {
    render(<Field initial="123456" />);
    moveCaret(6);
    expect(activeBox()).toBe(5);
    type('9');
    expect(field()).toHaveValue('123459');
    expect(field().selectionStart).toBe(6);
  });

  it('replaces a selected range with the typed digit and shows the selection', () => {
    render(<Field initial="123456" />);
    moveCaret(1, 4);
    expect(boxes().map(box => box.hasAttribute('data-selected'))).toEqual([false, true, true, true, false, false]);
    expect(activeBox()).toBe(-1);
    type('9');
    expect(field()).toHaveValue('1956');
    expect(field().selectionStart).toBe(2);
  });

  it('Backspace clears the highlighted box, or the previous one when the highlighted box is empty', () => {
    render(<Field initial="123456" />);
    moveCaret(3);
    backspace();
    expect(field()).toHaveValue('12356');
    expect(field().selectionStart).toBe(3);
    moveCaret(5);
    expect(activeBox()).toBe(5);
    expect(boxes()[5]).toHaveAttribute('data-caret');
    backspace();
    expect(field()).toHaveValue('1235');
    expect(field().selectionStart).toBe(4);
    backspace();
    expect(field()).toHaveValue('123');
  });

  it('Delete clears the highlighted box and does nothing past the last digit', () => {
    render(<Field initial="1234" />);
    moveCaret(1);
    forwardDelete();
    expect(field()).toHaveValue('134');
    expect(field().selectionStart).toBe(1);
    moveCaret(3);
    forwardDelete();
    expect(field()).toHaveValue('134');
  });

  it('removes a selected range with Backspace', () => {
    render(<Field initial="123456" />);
    moveCaret(1, 3);
    backspace();
    expect(field()).toHaveValue('1456');
    expect(field().selectionStart).toBe(1);
  });

  it('puts the caret at the end when the field takes keyboard focus', () => {
    render(<Field initial="123" />);
    focusField();
    expect(field().selectionStart).toBe(3);
    expect(activeBox()).toBe(3);
    expect(boxes()[3]).toHaveAttribute('data-caret');
  });
});

describe('paste and autofill', () => {
  it('accepts formatted codes of every shape', () => {
    render(<Field />);
    paste('123 456');
    expect(field()).toHaveValue('123456');
    paste('654-321');
    expect(field()).toHaveValue('654321');
    paste('Your code is 246810. It expires soon.');
    expect(field()).toHaveValue('246810');
    expect(field().selectionStart).toBe(6);
  });

  it('treats a whole pasted code as the code wherever the caret was', () => {
    render(<Field initial="12" />);
    moveCaret(0);
    paste('987654');
    expect(field()).toHaveValue('987654');
  });

  it('types a short paste in from the caret and ignores a paste with no digits', () => {
    render(<Field initial="12" />);
    moveCaret(2);
    paste('3 4');
    expect(field()).toHaveValue('1234');
    expect(field().selectionStart).toBe(4);
    paste('no digits here');
    expect(field()).toHaveValue('1234');
  });

  it('replaces a selection when pasting, and keeps leading zeros', () => {
    render(<Field initial="123456" />);
    moveCaret(0, 2);
    paste('00');
    expect(field()).toHaveValue('003456');
  });

  it('normalizes what a keyboard or autofill writes without a described edit', () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: '000 123' } });
    expect(field()).toHaveValue('000123');
    expect(digits()).toBe('000123');
  });

  it('gives a digit written without a described edit (composition keyboards) the same box rules', () => {
    render(<Field initial="123456" />);
    fireEvent.change(field(), { target: { value: '1239456', selectionStart: 4, selectionEnd: 4 } });
    expect(field()).toHaveValue('123956');
    expect(field().selectionStart).toBe(4);
  });
});

describe('pointer and viewport', () => {
  it('lands a tap on the box that was tapped, not past the digits that exist', () => {
    render(<Field initial="123456" />);
    focusField();
    field().getBoundingClientRect = () => ({ left: 100, width: 600 });
    fireEvent.click(field(), { clientX: 450 });
    expect(field().selectionStart).toBe(3);
    expect(activeBox()).toBe(3);
    fireEvent.click(field(), { clientX: 120 });
    expect(field().selectionStart).toBe(0);
    expect(activeBox()).toBe(0);
  });

  it('keeps a tap beside the last digit on the first empty box', () => {
    render(<Field initial="12" />);
    focusField();
    field().getBoundingClientRect = () => ({ left: 0, width: 600 });
    fireEvent.click(field(), { clientX: 590 });
    expect(field().selectionStart).toBe(2);
    expect(activeBox()).toBe(2);
  });

  it('brings the field into view when the keyboard resizes the visible area, but not on keystrokes', () => {
    const viewport = new EventTarget();
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    render(<Field />);
    const reveal = field().scrollIntoView = vi.fn();
    viewport.dispatchEvent(new Event('resize'));
    expect(reveal).not.toHaveBeenCalled();
    moveCaret(0);
    '1234'.split('').forEach(type);
    expect(reveal).not.toHaveBeenCalled();
    viewport.dispatchEvent(new Event('resize'));
    expect(reveal).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest' });
  });

  it('stops listening to the viewport when it unmounts', () => {
    const viewport = new EventTarget();
    vi.stubGlobal('visualViewport', viewport);
    const remove = vi.spyOn(viewport, 'removeEventListener');
    render(<Field />).unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
