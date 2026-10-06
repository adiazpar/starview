import { useTranslation } from 'react-i18next';
import './VerificationFeedback.css';

/** Stands in for {{email}} while translating, so the address can be emphasized wherever a language puts it. */
const MARK = '';

/** Centered explanation under the dialog title; a translated {{email}} renders in primary text without markup in locale files. */
export function VerificationLead({ i18nKey, email, ...props }) {
  const { t } = useTranslation();
  const [before, after] = t(i18nKey, email ? { email: MARK } : undefined).split(MARK);
  return <p {...props} className="verification-lead">
    {after === undefined ? before : <>{before}<strong>{email}</strong>{after}</>}
  </p>;
}

/**
 * Quiet inline feedback for verification, enrollment, email destination and backup state: a check for
 * something that worked, an alert (announced at once) for something to fix. No boxes for routine success.
 */
export function VerificationStatus({ tone = 'success', className = '', children, ...props }) {
  const error = tone === 'error';
  return <p {...props} className={`verification-status verification-status--${tone} ${className}`.trim()} role={error ? 'alert' : 'status'}>
    <i className={`fa-solid ${error ? 'fa-circle-exclamation' : 'fa-circle-check'}`} aria-hidden="true" /><span>{children}</span>
  </p>;
}
