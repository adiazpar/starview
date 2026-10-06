/**
 * Edit model for the six-box verification code (pure: no DOM, no React).
 *
 * The code is a string of at most six digits shown in six boxes. The caret points at box
 * min(caret, 5): typing puts a digit in that box (replacing what is there, or filling it when
 * empty) and moves on, so correcting a digit is "select its box, type". Backspace clears the
 * highlighted box, or the previous one when the highlighted box is empty. Every edit returns
 * { value, start, end }, the new value and the selection it leaves, so the caret never jumps
 * to the end on its own.
 */
export const CODE_LENGTH = 6;

const digitsIn = text => text.replace(/\D/g, '');
const at = (value, position) => ({ value, start: position, end: position });

/** Digits only, at most six: the one place a code value is normalized. */
export const normalizeCode = text => digitsIn(text).slice(0, CODE_LENGTH);

function typeDigit(value, caret, digit) {
  const box = Math.min(caret, CODE_LENGTH - 1);
  return at(value.slice(0, box) + digit + value.slice(box + 1), Math.min(box + 1, CODE_LENGTH));
}

/** Typing or pasting `text` over the selection [start, end). Anything that is not a digit is ignored. */
export function insertDigits(value, start, end, text) {
  const digits = digitsIn(text);
  if (!digits) return { value, start, end };
  // A whole code (paste, autofill) is the code, wherever the caret was.
  if (digits.length >= CODE_LENGTH) return at(digits.slice(0, CODE_LENGTH), CODE_LENGTH);
  if (start !== end) {
    const next = (value.slice(0, start) + digits + value.slice(end)).slice(0, CODE_LENGTH);
    return at(next, Math.min(start + digits.length, next.length));
  }
  let edit = at(value, start);
  for (const digit of digits) edit = typeDigit(edit.value, edit.start, digit);
  return edit;
}

/** Backspace or Delete with the selection [start, end). */
export function deleteDigits(value, start, end, direction) {
  if (start !== end) return at(value.slice(0, start) + value.slice(end), start);
  const box = Math.min(start, CODE_LENGTH - 1);
  if (box < value.length) return at(value.slice(0, box) + value.slice(box + 1), box);
  if (direction === 'backward' && value.length) return at(value.slice(0, -1), value.length - 1);
  return { value, start, end };
}

/**
 * Normalizes whatever the browser wrote when it could not describe the edit first (composition, autofill, drop) and
 * keeps the caret after the same digit. One digit added to the previous value is typing, so it gets the same box
 * rules as a described edit; anything else is the new code, cut to six digits.
 */
export function reconcile(raw, caret, previous = '') {
  const digits = digitsIn(raw);
  const upTo = Math.min(digitsIn(raw.slice(0, caret)).length, digits.length);
  if (upTo > 0 && digits.length === previous.length + 1 && digits.slice(0, upTo - 1) + digits.slice(upTo) === previous) {
    return insertDigits(previous, upTo - 1, upTo - 1, digits[upTo - 1]);
  }
  const value = digits.slice(0, CODE_LENGTH);
  return at(value, Math.min(upTo, value.length));
}
