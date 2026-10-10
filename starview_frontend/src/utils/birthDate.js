/**
 * Calendar rules for the private date of birth. A date travels as a 'YYYY-MM-DD' string and is only split and
 * compared as numbers: building a local Date from one, or reading toISOString, moves it a day in some timezones.
 * There is deliberately no age rule here, only what makes a real date that is not in the future.
 */

export const MIN_BIRTH_YEAR = 1900;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isLeapYear = year => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** An unchosen year (null) counts as a leap year, so February 29 stays available until the year rules it out. */
export function daysInMonth(year, month) {
  if (!month) return 31;
  if (month === 2) return year == null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Today's calendar date on the person's own clock. */
export const localToday = (now = new Date()) => ({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });

/** Splits 'YYYY-MM-DD' into numbers, or returns null unless it names a real calendar date. */
export function parseIsoDate(value) {
  const match = ISO_DATE.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? { year, month, day } : null;
}

export const toIsoDate = ({ year, month, day }) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Checks chosen parts (numbers, or the strings a select reports, '' meaning not chosen) against the calendar
 * and today. Returns { iso } for a usable date, otherwise { error }: 'incomplete', 'invalid', 'tooEarly' or 'future'.
 */
export function validateBirthDate({ year, month, day }, today = localToday()) {
  const [y, m, d] = [year, month, day].map(part => (part === '' || part == null ? NaN : Number(part)));
  if ([y, m, d].some(Number.isNaN)) return { error: 'incomplete' };
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return { error: 'invalid' };
  if (y < MIN_BIRTH_YEAR) return { error: 'tooEarly' };
  const ordinal = (a, b, c) => a * 10000 + b * 100 + c;
  if (ordinal(y, m, d) > ordinal(today.year, today.month, today.day)) return { error: 'future' };
  return { iso: toIsoDate({ year: y, month: m, day: d }) };
}

/** A stored date as text in the reader's language, or '' when there is none. Formatted in UTC so no timezone can move the day. */
export function formatBirthDate(value, locale) {
  const parts = parseIsoDate(value);
  if (!parts) return '';
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** The twelve month names in the reader's language, January first. */
export function monthNames(locale) {
  const format = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, index) => format.format(new Date(Date.UTC(2000, index, 1))));
}

/** The server's reason for rejecting a date ({ errors: { birth_date: [message] } }, else detail), or '' to use the caller's wording. */
export function birthDateErrorMessage(error) {
  const data = error?.response?.data;
  const message = [].concat(data?.errors?.birth_date ?? [])[0] || data?.detail;
  return typeof message === 'string' ? message : '';
}
