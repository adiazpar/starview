import { fireEvent, screen } from '@testing-library/react';
import common from '../../public/locales/en/common.json';

/** The real English strings, so tests read like the screen and fail when a key goes missing. */
export const english = key => key.split('.').reduce((value, part) => value?.[part], common) || key;

/** jsdom has no modal dialogs. */
export function stubModalDialog() {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}

export const select = name => screen.getByRole('combobox', { name });

/** Chooses through the three selects in the order given, so a test can pick the day before the year. */
export function pickDate({ month, day, year }) {
  if (month) fireEvent.change(select('Month'), { target: { value: String(month) } });
  if (day) fireEvent.change(select('Day'), { target: { value: String(day) } });
  if (year) fireEvent.change(select('Year'), { target: { value: String(year) } });
}
