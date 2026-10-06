import { createContext, useCallback, useContext, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './styles.css';

const FooterContext = createContext(null);
const STEP_TARGET = '[data-autofocus]:not(:disabled)';
const TEXT_FIELD = '.app-dialog-body input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not(:disabled), .app-dialog-body textarea:not(:disabled)';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Nested forms place their submit controls in the same fixed modal footer. */
export function DialogFooter({ children }) {
  const container = useContext(FooterContext);
  return container ? createPortal(children, container) : null;
}

/**
 * Native focus-trapped dialog. Footer actions can call ref.dismiss(completion)
 * to share the X/Escape exit animation before their owner removes the dialog.
 * Programmatic completion is allowed after a successful request; user dismissal
 * is independently blocked by dismissDisabled while a request is pending.
 *
 * By default the header shows an X that dismisses. A multi-step owner can pass
 * onBack to get a back arrow in its place: the owner decides what "back" means
 * (a step, or ref.dismiss() on its first level) and backLabel names what it does.
 * The arrow is blocked by dismissDisabled and while closing, exactly like the X.
 * Escape always dismisses through onCancel; it never becomes a step back.
 */
export default function Dialog({ ref, title, onCancel, onBack, backLabel, children, footer, dismissDisabled = false, focusKey = title }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const body = useRef(null);
  const titleId = useId();
  const heading = useRef(null);
  const lifecycle = useRef(0);
  const closing = useRef(false);
  const completion = useRef(null);
  const previousStep = useRef(focusKey);
  const [isClosing, setIsClosing] = useState(false);
  const [footerElement, setFooterElement] = useState(null);

  const dismiss = useCallback((afterClose = onCancel) => {
    if (closing.current) return completion.current;
    const element = dialog.current;
    const generation = lifecycle.current;
    closing.current = true;
    setIsClosing(true);
    // Apply the exit class synchronously so getAnimations sees the CSS exit,
    // rather than an entrance animation from the previous render.
    element.classList.add('app-dialog--closing');
    const finish = () => {
      if (generation !== lifecycle.current || !element.isConnected) return;
      element.close();
      afterClose?.();
    };
    const animations = reducedMotion() ? [] : (element.getAnimations?.() || []);
    if (!animations.length) {
      finish();
      completion.current = Promise.resolve();
    } else {
      // CSS owns duration/easing. Cancellation (including a motion-preference
      // change) also settles, so dismissal cannot get stuck awaiting animationend.
      completion.current = Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
    }
    return completion.current;
  }, [onCancel]);
  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  useEffect(() => {
    const element = dialog.current;
    lifecycle.current += 1;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    (element.querySelector(STEP_TARGET) || element.querySelector(TEXT_FIELD) || heading.current).focus();
    return () => {
      lifecycle.current += 1;
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const element = dialog.current;
    const update = () => {
      element.style.setProperty('--dialog-viewport-height', `${viewport.height}px`);
      element.style.setProperty('--dialog-viewport-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (closing.current) return;
    const target = dialog.current.querySelector(STEP_TARGET);
    if (target) target.focus();
    else if (!dialog.current.contains(document.activeElement)) heading.current.focus();
    if (previousStep.current !== focusKey) {
      previousStep.current = focusKey;
      body.current.scrollTop = 0;
      if (!reducedMotion()) {
        // The stylesheet animates direct step content. Restart those animations
        // together without remounting forms or replaying the whole sheet entrance.
        const content = Array.from(body.current.children);
        content.forEach(element => { element.style.animationName = 'none'; });
        body.current.getBoundingClientRect();
        content.forEach(element => { element.style.removeProperty('animation-name'); });
      }
    }
  }, [focusKey, footerElement]);

  const cancel = () => { if (!dismissDisabled && !closing.current) dismiss(); };
  const back = () => { if (!dismissDisabled && !closing.current) onBack(); };
  return createPortal(
    <dialog ref={dialog} className={`app-dialog${isClosing ? ' app-dialog--closing' : ''}`} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); cancel(); }}>
      <header className="app-dialog-header">
        <button type="button" className="app-dialog-close" onClick={onBack ? back : cancel}
          disabled={dismissDisabled || isClosing} aria-label={onBack ? backLabel || t('buttons.back') : t('buttons.close')}>
          <i className={`fa-solid ${onBack ? 'fa-arrow-left' : 'fa-xmark'}`} aria-hidden="true" />
        </button>
        <h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2>
        <span aria-hidden="true" />
      </header>
      <FooterContext.Provider value={footerElement}>
        <div ref={body} className="app-dialog-body" inert={isClosing}>{children}</div>
      </FooterContext.Provider>
      <footer ref={setFooterElement} className="app-dialog-footer" inert={isClosing}>{footer}</footer>
    </dialog>, document.body,
  );
}
