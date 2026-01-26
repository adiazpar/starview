/**
 * LocaleSelector Component
 *
 * Button that opens a modal for language selection (Airbnb-style).
 * Displays current language, opens full modal with grid of options.
 * Syncs to backend for authenticated users, localStorage for guests.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';

export default function LocaleSelector() {
  const { t } = useTranslation('common');
  const {
    language,
    setLanguage,
    isUpdating,
    languageConfig,
    supportedLanguages,
    allLanguageConfigs,
  } = useLanguage();

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Handle open modal
  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = prefersReducedMotion ? 0 : 300;
    setTimeout(() => {
      setIsClosing(false);
      setIsOpen(false);
    }, delay);
  }, []);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Handle language selection
  const handleSelect = async (langCode) => {
    if (langCode !== language) {
      await setLanguage(langCode);
    }
    handleClose();
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        className="locale-selector__trigger"
        onClick={handleOpen}
        aria-label={t('language.selectLanguage', 'Choose a language and region')}
        disabled={isUpdating}
      >
        <i className="fa-solid fa-globe" />
        <span>{languageConfig.nativeName} ({languageConfig.region})</span>
      </button>

      {/* Modal */}
      {isOpen && createPortal(
        <div
          className={`locale-modal-overlay${isClosing ? ' locale-modal-overlay--closing' : ''}`}
          onClick={handleOverlayClick}
        >
          <div className={`locale-modal${isClosing ? ' locale-modal--closing' : ''}`}>
            {/* Header */}
            <div className="locale-modal__header">
              <button
                className="locale-modal__close"
                onClick={handleClose}
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" />
              </button>
              <h2 className="locale-modal__title">
                {t('language.title', 'Choose a language and region')}
              </h2>
              <div className="locale-modal__header-spacer" />
            </div>

            {/* Content */}
            <div className="locale-modal__content">
              <div className="locale-modal__grid">
                {supportedLanguages.map((langCode) => {
                  const config = allLanguageConfigs[langCode];
                  const isSelected = langCode === language;

                  return (
                    <button
                      key={langCode}
                      className={`locale-modal__option${isSelected ? ' locale-modal__option--selected' : ''}`}
                      onClick={() => handleSelect(langCode)}
                      aria-pressed={isSelected}
                    >
                      <span className={`fi fi-${config.flag} locale-modal__flag`} />
                      <div className="locale-modal__option-text">
                        <span className="locale-modal__option-language">{config.nativeName}</span>
                        <span className="locale-modal__option-region">{config.region}</span>
                      </div>
                      {isSelected && (
                        <i className="fa-solid fa-check locale-modal__check" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
