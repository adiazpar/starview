import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CODE_LENGTH, deleteDigits, insertDigits, reconcile } from './verificationCodeEdit';
import './VerificationCodeField.css';

const BACKUP_LIMIT = 32;
const BOXES = Array.from({ length: CODE_LENGTH }, (_, index) => index);
const CODE_INPUT = { type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', enterKeyHint: 'done',
  autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false };

/** Recovery codes keep spaces out and may be longer than a one-time code. */
const normalizeBackup = value => value.replace(/\s+/g, '').slice(0, BACKUP_LIMIT);

/**
 * One real input for verification codes, so paste, autofill, the numeric keypad and one-time-code
 * suggestions work and assistive technology sees a single control. For a six-digit code the
 * input is transparent and lies over six aria-hidden boxes that mirror its value and caret: the
 * highlighted box is where the next digit goes. `backup` is the longer recovery code, a plain
 * input; passwords stay ordinary inputs. onChange receives the normalized value.
 */
export default function VerificationCodeField({ backup = false, ...props }) {
  return backup ? <BackupCodeField {...props} /> : <CodeBoxes {...props} />;
}

function BackupCodeField({ ref, id, label, value, onChange, invalid = false, describedBy, ...input }) {
  return <div className="verification-code verification-code--backup">
    <label className="verification-code-label" htmlFor={id}>{label}</label>
    <input {...input} {...CODE_INPUT} id={id} ref={ref} className="form-input verification-code-input"
      value={value} aria-invalid={invalid} aria-describedby={describedBy}
      onChange={event => onChange(normalizeBackup(event.target.value))} />
  </div>;
}

function CodeBoxes({ ref, id, label, value, onChange, invalid = false, describedBy, disabled, ...input }) {
  const inputRef = useRef(null);
  const pending = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);

  const setRefs = useCallback(node => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  // Helpers take the element from the event when they have one: with autoFocus the first focus event fires before
  // React has attached the ref.
  const read = element => ({ start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0 });
  const mirror = (element = inputRef.current) => {
    if (!element) return;
    const next = read(element);
    setSelection(previous => previous.start === next.start && previous.end === next.end ? previous : next);
  };
  const place = (start, end = start, element = inputRef.current) => {
    if (!element) return;
    element.setSelectionRange(start, end);
    mirror(element);
  };
  // Report the new value; the layout effect puts the caret where the edit leaves it once React has written the value.
  const commit = edit => {
    if (edit.value === value) { place(edit.start, edit.end); return; }
    pending.current = edit;
    onChange(edit.value);
  };

  useLayoutEffect(() => {
    const edit = pending.current;
    pending.current = null;
    if (edit && inputRef.current?.value === edit.value) inputRef.current.setSelectionRange(edit.start, edit.end);
    mirror();
  });

  // Typing and deleting are applied from the browser's own description of the edit, so the caret and a digit
  // being corrected stay put. Edits that cannot be cancelled (composition, undo) arrive through onChange.
  useEffect(() => {
    const element = inputRef.current;
    const onBeforeInput = event => {
      if (!event.cancelable) return;
      const { start, end } = read(element);
      let edit;
      if (event.inputType === 'insertText') edit = insertDigits(element.value, start, end, event.data ?? '');
      else if (event.inputType === 'deleteContentBackward') edit = deleteDigits(element.value, start, end, 'backward');
      else if (event.inputType === 'deleteContentForward') edit = deleteDigits(element.value, start, end, 'forward');
      else return;
      event.preventDefault();
      commit(edit);
    };
    element.addEventListener('beforeinput', onBeforeInput);
    return () => element.removeEventListener('beforeinput', onBeforeInput);
  });

  // Keep the field in view when the software keyboard resizes the visible area (not on every keystroke).
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      // Wait a frame so the dialog has already fitted itself to the new visible height.
      frame = requestAnimationFrame(() => {
        if (document.activeElement === inputRef.current) inputRef.current.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      });
    };
    viewport.addEventListener('resize', reveal);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener('resize', reveal); };
  }, []);

  const handleChange = event => {
    const edit = reconcile(event.target.value, event.target.selectionStart ?? event.target.value.length, value);
    if (edit.value !== value) { commit(edit); return; }
    // Rejected characters: React restores the control after this handler, so restore the caret after that.
    queueMicrotask(() => place(edit.start, edit.end));
  };
  const handlePaste = event => {
    event.preventDefault();
    const { start, end } = read(event.target);
    commit(insertDigits(event.target.value, start, end, event.clipboardData?.getData('text') ?? ''));
  };
  // A tap or click lands on a box, not on the transparent text underneath it.
  const handleClick = event => {
    const element = event.target;
    if (element.selectionStart !== element.selectionEnd) return;
    const { left, width } = element.getBoundingClientRect();
    if (!width) return;
    const box = Math.floor(((event.clientX - left) / width) * CODE_LENGTH);
    const caret = Math.min(Math.max(box, 0), element.value.length);
    place(caret, caret, element);
  };
  const handleFocus = event => {
    setFocused(true);
    const end = event.target.value.length;
    place(end, end, event.target);
  };

  const collapsed = selection.start === selection.end;
  const active = focused && collapsed ? Math.min(selection.start, CODE_LENGTH - 1) : -1;
  const flag = condition => condition || undefined;

  return <div className="verification-code">
    <label className="verification-code-label" htmlFor={id}>{label}</label>
    <div className="verification-code-boxes" data-invalid={flag(invalid)} data-disabled={flag(disabled)}>
      <input {...input} {...CODE_INPUT} id={id} ref={setRefs} className="form-input verification-code-input" disabled={disabled}
        pattern={`[0-9]{${CODE_LENGTH}}`} value={value} aria-invalid={invalid} aria-describedby={describedBy}
        onChange={handleChange} onPaste={handlePaste} onClick={handleClick} onSelect={() => mirror()} onKeyUp={() => mirror()}
        onFocus={handleFocus} onBlur={() => setFocused(false)} />
      <div className="verification-code-slots" aria-hidden="true">
        {BOXES.map(index => <span key={index} className="verification-code-slot"
          data-filled={flag(index < value.length)} data-active={flag(index === active)}
          data-selected={flag(focused && !collapsed && index >= selection.start && index < selection.end)}
          data-caret={flag(index === active && index >= value.length)}>{value[index]}</span>)}
      </div>
    </div>
  </div>;
}
