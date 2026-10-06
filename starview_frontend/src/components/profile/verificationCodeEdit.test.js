import { describe, expect, it } from 'vitest';
import { deleteDigits, insertDigits, normalizeCode, reconcile } from './verificationCodeEdit';

const edit = (value, start, end = start) => ({ value, start, end });

describe('verification code edit model', () => {
  it('normalizes to at most six ASCII digits and keeps leading zeros', () => {
    expect(normalizeCode('012 345')).toBe('012345');
    expect(normalizeCode('12-34-56-78')).toBe('123456');
    expect(normalizeCode('abc')).toBe('');
  });

  it('types a digit into the box at the caret: fills the next box, replaces a digit, replaces the last when full', () => {
    expect(insertDigits('', 0, 0, '1')).toEqual(edit('1', 1));
    expect(insertDigits('12', 2, 2, '3')).toEqual(edit('123', 3));
    expect(insertDigits('123456', 1, 1, '9')).toEqual(edit('193456', 2));
    expect(insertDigits('12', 0, 0, '9')).toEqual(edit('92', 1));
    expect(insertDigits('123456', 6, 6, '9')).toEqual(edit('123459', 6));
  });

  it('ignores anything that is not a digit and reports the selection unchanged', () => {
    expect(insertDigits('123456', 2, 2, 'a')).toEqual(edit('123456', 2));
    expect(insertDigits('12', 0, 2, ' -')).toEqual(edit('12', 0, 2));
  });

  it('replaces a selected range as one edit', () => {
    expect(insertDigits('123456', 1, 4, '9')).toEqual(edit('1956', 2));
    expect(insertDigits('123456', 2, 4, '99')).toEqual(edit('129956', 4));
    expect(insertDigits('123456', 0, 6, '4')).toEqual(edit('4', 1));
  });

  it('treats a pasted digit run as typing, and a whole code as the code', () => {
    expect(insertDigits('12', 2, 2, '3 4')).toEqual(edit('1234', 4));
    expect(insertDigits('1234', 1, 1, '99')).toEqual(edit('1994', 3));
    expect(insertDigits('12', 0, 0, '987654')).toEqual(edit('987654', 6));
    expect(insertDigits('123456', 2, 3, '00 11 22 33')).toEqual(edit('001122', 6));
    expect(insertDigits('', 0, 0, '000000')).toEqual(edit('000000', 6));
  });

  it('Backspace clears the highlighted box, or the previous one when the highlighted box is empty', () => {
    expect(deleteDigits('123456', 6, 6, 'backward')).toEqual(edit('12345', 5));
    expect(deleteDigits('123456', 3, 3, 'backward')).toEqual(edit('12356', 3));
    expect(deleteDigits('123', 3, 3, 'backward')).toEqual(edit('12', 2));
    expect(deleteDigits('', 0, 0, 'backward')).toEqual(edit('', 0));
  });

  it('Delete clears the highlighted box and does nothing in an empty one', () => {
    expect(deleteDigits('123456', 1, 1, 'forward')).toEqual(edit('13456', 1));
    expect(deleteDigits('123', 3, 3, 'forward')).toEqual(edit('123', 3));
  });

  it('deletes a selected range whichever key was used', () => {
    expect(deleteDigits('123456', 1, 4, 'backward')).toEqual(edit('156', 1));
    expect(deleteDigits('123456', 1, 4, 'forward')).toEqual(edit('156', 1));
  });

  it('reconciles whatever the browser wrote, keeping the caret after the same digit', () => {
    expect(reconcile('123 456', 7)).toEqual(edit('123456', 6));
    expect(reconcile('12a3', 3)).toEqual(edit('123', 2));
    expect(reconcile('1234567', 7)).toEqual(edit('123456', 6));
    expect(reconcile('', 0)).toEqual(edit('', 0));
  });

  it('treats one added digit as typing, with the same box rules as a described edit', () => {
    expect(reconcile('129', 3, '12')).toEqual(edit('129', 3));
    expect(reconcile('1239456', 4, '123456')).toEqual(edit('123956', 4));
    expect(reconcile('1234567', 7, '123456')).toEqual(edit('123457', 6));
    expect(reconcile('1', 1, '')).toEqual(edit('1', 1));
  });

  it('takes any other change, such as autofill replacing the field, as the new code', () => {
    expect(reconcile('123456', 6, '12')).toEqual(edit('123456', 6));
    expect(reconcile('612345', 6, '12345')).toEqual(edit('612345', 6));
    expect(reconcile('12a', 3, '12')).toEqual(edit('12', 2));
  });
});
