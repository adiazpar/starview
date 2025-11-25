/**
 * usePasswordValidation Hook
 *
 * Custom hook for validating password strength and matching confirmation passwords.
 * Provides real-time validation feedback for password requirements.
 *
 * Usage:
 * const {
 *   passwordValidation,
 *   passwordMatch,
 *   validatePassword,
 *   validatePasswordMatch,
 *   isPasswordValid
 * } = usePasswordValidation();
 *
 * @returns {Object} Validation state and functions
 */

import { useState } from 'react';

function usePasswordValidation() {
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasNumber: false,
    hasSpecial: false,
  });

  const [passwordMatch, setPasswordMatch] = useState(false);

  /**
   * Validate password against requirements
   * @param {string} password - Password to validate
   */
  const validatePassword = (password) => {
    setPasswordValidation({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  };

  /**
   * Validate password match
   * @param {string} newPassword - New password
   * @param {string} confirmPassword - Confirmation password
   */
  const validatePasswordMatch = (newPassword, confirmPassword) => {
    setPasswordMatch(confirmPassword.length > 0 && newPassword === confirmPassword);
  };

  /**
   * Check if all password requirements are met
   * @returns {boolean}
   */
  const isPasswordValid = () => {
    return (
      passwordValidation.minLength &&
      passwordValidation.hasUppercase &&
      passwordValidation.hasNumber &&
      passwordValidation.hasSpecial
    );
  };

  /**
   * Reset validation state
   */
  const resetValidation = () => {
    setPasswordValidation({
      minLength: false,
      hasUppercase: false,
      hasNumber: false,
      hasSpecial: false,
    });
    setPasswordMatch(false);
  };

  return {
    passwordValidation,
    passwordMatch,
    validatePassword,
    validatePasswordMatch,
    isPasswordValid,
    resetValidation,
  };
}

export default usePasswordValidation;
