import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '../shared/Dialog';
import LoadingSpinner from '../shared/LoadingSpinner';
import { VerificationStatus } from './VerificationFeedback';
import {
  MIN_BIRTH_YEAR, birthDateErrorMessage, daysInMonth, localToday, monthNames, parseIsoDate, validateBirthDate,
} from '../../utils/birthDate';
import './BirthDateDialog.css';

const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
const BLANK = { month: '', day: '', year: '' };
// Select values are strings, and '' means not chosen yet. A starting date the selects cannot show starts blank.
const initialParts = value => {
  const parts = parseIsoDate(value);
  return parts && validateBirthDate(parts).iso
    ? { month: String(parts.month), day: String(parts.day), year: String(parts.year) }
    : BLANK;
};

/** A native select whose placeholder doubles as its visible name; the name stays on it once a value replaces the placeholder. */
function DateSelect({ label, value, invalid, children, ...props }) {
  return <div className="birth-date-select">
    <select {...props} className={`form-input${invalid ? ' error' : ''}`} aria-label={label} aria-invalid={invalid || undefined}
      value={value} data-empty={value === '' || undefined}>
      <option value="" disabled hidden>{label}</option>
      {children}
    </select>
    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
  </div>;
}

/**
 * The one place a date of birth is entered: signup, settings and the post-sign-in prompt all open this dialog.
 * It only collects the date. The owner decides what saving means and must unmount the dialog in onClose.
 *
 * - initialValue: 'YYYY-MM-DD' to start from. What is chosen afterwards is a draft; it is gone when the dialog closes.
 * - onSubmit(iso): async. A rejection keeps the dialog open with the server's reason; success closes it.
 * - onSkip(): optional async secondary action that leaves the date out ("Skip for now", "Remove").
 * - onClose(outcome): once the exit animation ends, with 'saved', 'skipped' or 'dismissed' (X or Escape).
 * - initialError: a reason to show on arrival, for an owner that reopens the dialog after a failure of its own.
 */
export default function BirthDateDialog({ initialValue, onSubmit, onSkip, onClose, submitLabel, skipLabel, initialError = '' }) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const errorId = useId();
  const dialog = useRef(null);
  const mounted = useRef(false);
  const running = useRef(false);
  const submitButton = useRef(null);
  const skipButton = useRef(null);
  const retryTarget = useRef(null);
  const [parts, setParts] = useState(() => initialParts(initialValue));
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // The control that sent a rejected request was disabled while it ran, so focus returns to it once it is enabled again.
  useEffect(() => {
    if (error && !pending) retryTarget.current?.focus();
  }, [error, pending]);

  const today = localToday();
  const months = useMemo(() => monthNames(i18n.resolvedLanguage || i18n.language), [i18n.resolvedLanguage, i18n.language]);
  const years = range(MIN_BIRTH_YEAR, today.year).reverse();
  const year = parts.year ? Number(parts.year) : null;
  const month = parts.month ? Number(parts.month) : null;
  const result = validateBirthDate(parts, today);
  // A complete date can still be wrong (only a future one is reachable from the selects); a partial one is just unfinished.
  const problem = result.error && result.error !== 'incomplete' ? result.error : null;
  const message = problem ? t(problem === 'future' ? 'birthDate.future' : 'birthDate.invalid') : error;
  const locked = !!pending;

  const choose = (field, value) => {
    setParts(current => {
      const next = { ...current, [field]: value };
      // A day the new month or year does not have is cleared rather than quietly moved to another date.
      const limit = daysInMonth(next.year ? Number(next.year) : null, next.month ? Number(next.month) : null);
      return next.day && Number(next.day) > limit ? { ...next, day: '' } : next;
    });
    setError('');
  };

  const run = async (kind, action) => {
    if (running.current) return;
    running.current = true;
    retryTarget.current = kind === 'skip' ? skipButton.current : submitButton.current;
    setPending(kind);
    setError('');
    try {
      await action();
    } catch (err) {
      running.current = false;
      if (!mounted.current) return;
      // A request cancelled by an account change or an expired session ends with the page, not with a message here.
      if (err?.code !== 'ERR_CANCELED') setError(birthDateErrorMessage(err) || t(kind === 'skip' ? 'birthDate.skipFailed' : 'birthDate.saveFailed'));
      setPending(null);
      return;
    }
    // Success keeps the spinner through the exit animation; the dialog is finished.
    if (mounted.current) dialog.current?.dismiss(() => onClose?.(kind === 'skip' ? 'skipped' : 'saved'));
  };

  const select = (field, label, options) => <DateSelect label={label} value={parts[field]} disabled={locked} invalid={!!message}
    aria-describedby={message ? errorId : undefined} onChange={event => choose(field, event.target.value)}>
    {options}
  </DateSelect>;

  return <Dialog ref={dialog} title={t('birthDate.title')} onCancel={() => onClose?.('dismissed')} dismissDisabled={locked}
    footer={<div className="app-dialog-actions app-dialog-actions--spread">
      {onSkip && <button ref={skipButton} type="button" className="btn-secondary btn-secondary--sm" disabled={locked}
        onClick={() => run('skip', onSkip)}>
        {pending === 'skip' && <LoadingSpinner size="xs" inline />}{skipLabel || t('birthDate.skip')}
      </button>}
      <button ref={submitButton} type="submit" form={formId} className="btn-primary btn-primary--sm" disabled={locked || !result.iso}>
        {pending === 'submit' && <LoadingSpinner size="xs" inline />}{submitLabel || t('buttons.save')}
      </button>
    </div>}>
    <p className="birth-date-note"><i className="fa-solid fa-lock" aria-hidden="true" />{t('birthDate.private')}</p>
    <form id={formId} className="birth-date-form" onSubmit={event => {
      event.preventDefault();
      if (result.iso) run('submit', () => onSubmit(result.iso));
    }}>
      <div className="birth-date-fields" role="group" aria-label={t('birthDate.title')}>
        {select('month', t('birthDate.month'), months.map((name, index) => <option key={name} value={index + 1}>{name}</option>))}
        {select('day', t('birthDate.day'), range(1, daysInMonth(year, month)).map(day => <option key={day} value={day}>{day}</option>))}
        {select('year', t('birthDate.year'), years.map(value => <option key={value} value={value}>{value}</option>))}
      </div>
      {message && <VerificationStatus tone="error" id={errorId}>{message}</VerificationStatus>}
    </form>
  </Dialog>;
}
