import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './styles.css';

const FooterContext = createContext(null);

/** Nested forms place their submit controls in the same fixed modal footer. */
export function DialogFooter({ children }) {
  const container = useContext(FooterContext);
  return container ? createPortal(children, container) : null;
}

/** Shared native modal: focus trapping, Escape dismissal, and Starview styling. */
export default function Dialog({ title, onCancel, children, footer, dismissDisabled = false, focusKey = title }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const titleId = useId();
  const heading = useRef(null);
  const [footerElement, setFooterElement] = useState(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);
  useEffect(() => {
    // A step can remove the focused button. Keep keyboard/screen-reader focus
    // inside the modal without stealing it from a newly focused code field.
    if (!dialog.current.contains(document.activeElement)) heading.current.focus();
  }, [focusKey]);
  return createPortal(
    <dialog ref={dialog} className="app-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!dismissDisabled) onCancel(); }}>
      <header className="app-dialog-header">
        <button type="button" className="app-dialog-close" onClick={onCancel}
          disabled={dismissDisabled} aria-label={t('buttons.close')}>
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
        <h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2>
        <span aria-hidden="true" />
      </header>
      <FooterContext.Provider value={footerElement}>
        <div className="app-dialog-body">{children}</div>
      </FooterContext.Provider>
      <footer ref={setFooterElement} className="app-dialog-footer">{footer}</footer>
    </dialog>, document.body,
  );
}
