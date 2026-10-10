/* global process -- the timezone tests switch TZ, which only the Node test runner can do */
import { afterEach, describe, expect, it } from 'vitest';
import {
  birthDateErrorMessage, daysInMonth, formatBirthDate, isLeapYear, localToday, monthNames, parseIsoDate, toIsoDate, validateBirthDate,
} from './birthDate';

const today = { year: 2026, month: 10, day: 9 };

describe('calendar rules', () => {
  it.each([[2000, true], [2024, true], [1904, true], [1900, false], [2100, false], [2023, false]])(
    'knows whether %i is a leap year', (year, leap) => expect(isLeapYear(year)).toBe(leap));

  it('gives February 29 days only in leap years, and keeps it available while the year is unknown', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(null, 2)).toBe(29);
  });

  it('counts the days of every month, and allows 31 until a month is chosen', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => daysInMonth(2023, month)))
      .toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(daysInMonth(2023, null)).toBe(31);
  });
});

describe('ISO dates', () => {
  it('splits a real calendar date into numbers', () => {
    expect(parseIsoDate('1990-03-14')).toEqual({ year: 1990, month: 3, day: 14 });
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it.each(['2023-02-29', '1900-02-29', '2024-02-30', '2024-13-01', '2024-00-10', '2024-04-31', '1990-3-14',
    '1990/03/14', '1990-03-14T00:00:00Z', '', null, undefined, 19900314])('rejects %j', value => {
    expect(parseIsoDate(value)).toBeNull();
  });

  it('pads parts so the string stays YYYY-MM-DD', () => {
    expect(toIsoDate({ year: 1990, month: 3, day: 4 })).toBe('1990-03-04');
    expect(toIsoDate({ year: 1900, month: 1, day: 1 })).toBe('1900-01-01');
  });
});

describe('validating a birth date', () => {
  it('accepts a complete real date, from numbers or from select strings', () => {
    expect(validateBirthDate({ year: 1990, month: 3, day: 14 }, today)).toEqual({ iso: '1990-03-14' });
    expect(validateBirthDate({ year: '2001', month: '1', day: '5' }, today)).toEqual({ iso: '2001-01-05' });
  });

  it('calls a date incomplete until all three parts are chosen', () => {
    expect(validateBirthDate({ year: '', month: '', day: '' }, today)).toEqual({ error: 'incomplete' });
    expect(validateBirthDate({ year: '1990', month: '3', day: '' }, today)).toEqual({ error: 'incomplete' });
    expect(validateBirthDate({ year: null, month: 3, day: 14 }, today)).toEqual({ error: 'incomplete' });
  });

  it('rejects days the calendar does not have, and allows leap days only in leap years', () => {
    expect(validateBirthDate({ year: 2023, month: 2, day: 29 }, today)).toEqual({ error: 'invalid' });
    expect(validateBirthDate({ year: 1900, month: 2, day: 29 }, today)).toEqual({ error: 'invalid' });
    expect(validateBirthDate({ year: 2024, month: 4, day: 31 }, today)).toEqual({ error: 'invalid' });
    expect(validateBirthDate({ year: 2024, month: 13, day: 1 }, today)).toEqual({ error: 'invalid' });
    expect(validateBirthDate({ year: 2024, month: 2, day: 29 }, today)).toEqual({ iso: '2024-02-29' });
    expect(validateBirthDate({ year: 2000, month: 2, day: 29 }, today)).toEqual({ iso: '2000-02-29' });
  });

  it('accepts today and refuses anything after it', () => {
    expect(validateBirthDate({ year: 2026, month: 10, day: 9 }, today)).toEqual({ iso: '2026-10-09' });
    expect(validateBirthDate({ year: 2026, month: 10, day: 10 }, today)).toEqual({ error: 'future' });
    expect(validateBirthDate({ year: 2026, month: 11, day: 1 }, today)).toEqual({ error: 'future' });
    expect(validateBirthDate({ year: 2027, month: 1, day: 1 }, today)).toEqual({ error: 'future' });
  });

  it('has no minimum age: yesterday is as acceptable as 1900', () => {
    expect(validateBirthDate({ year: 2026, month: 10, day: 8 }, today)).toEqual({ iso: '2026-10-08' });
    expect(validateBirthDate({ year: 1900, month: 1, day: 1 }, today)).toEqual({ iso: '1900-01-01' });
  });

  it('starts at 1900', () => {
    expect(validateBirthDate({ year: 1899, month: 12, day: 31 }, today)).toEqual({ error: 'tooEarly' });
  });

  it('reads today from the local calendar, not from UTC', () => {
    expect(localToday(new Date(2026, 9, 9, 23, 59))).toEqual(today);
    expect(localToday(new Date(2026, 9, 9, 0, 1))).toEqual(today);
  });
});

describe('showing a date', () => {
  const zone = process.env.TZ;
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it('formats in the reader language', () => {
    expect(formatBirthDate('1990-03-14', 'en')).toBe('March 14, 1990');
    expect(formatBirthDate('1990-03-14', 'de')).toBe('14. März 1990');
    expect(formatBirthDate('2024-02-29', 'en')).toBe('February 29, 2024');
  });

  it.each([null, undefined, '', 'garbage', '2023-02-29'])('shows nothing for %j', value => {
    expect(formatBirthDate(value, 'en')).toBe('');
  });

  it.each(['Pacific/Pago_Pago', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
    'never moves the day with the timezone (%s)', zoneName => {
      process.env.TZ = zoneName;
      expect(formatBirthDate('1990-03-14', 'en')).toBe('March 14, 1990');
      expect(formatBirthDate('2000-01-01', 'en')).toBe('January 1, 2000');
      expect(formatBirthDate('1999-12-31', 'en')).toBe('December 31, 1999');
    });

  it('would move the day if the string were read as a local Date, which is what this avoids', () => {
    process.env.TZ = 'Pacific/Pago_Pago';
    expect(new Date('1990-03-14').getDate()).toBe(13);
  });

  it('lists the month names for the select, January first', () => {
    expect(monthNames('en')).toEqual(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December']);
    expect(monthNames('de')[2]).toBe('März');
  });
});

describe('server reasons', () => {
  it('prefers the date field message, then the general one', () => {
    expect(birthDateErrorMessage({ response: { data: { detail: 'Invalid.', errors: { birth_date: ['Enter a date in 1900 or later.'] } } } }))
      .toBe('Enter a date in 1900 or later.');
    expect(birthDateErrorMessage({ response: { data: { errors: { birth_date: 'Plain text.' } } } })).toBe('Plain text.');
    expect(birthDateErrorMessage({ response: { data: { detail: 'Something broke.' } } })).toBe('Something broke.');
  });

  it('leaves the wording to the caller when the server gave none', () => {
    expect(birthDateErrorMessage(new Error('Network Error'))).toBe('');
    expect(birthDateErrorMessage({ response: { data: { detail: { nested: true } } } })).toBe('');
    expect(birthDateErrorMessage(undefined)).toBe('');
  });
});
