/**
 * useFormSubmit Hook
 *
 * Custom hook that encapsulates common form submission logic including:
 * - Loading state management
 * - Success/error message handling
 * - API call execution
 * - Optional callback execution on success
 *
 * Usage:
 * const { loading, error, success, handleSubmit, clearMessages } = useFormSubmit({
 *   onSubmit: async (data) => await api.updateProfile(data),
 *   onSuccess: () => console.log('Success!'),
 *   successMessage: 'Profile updated!'
 * });
 *
 * @param {Object} options
 * @param {Function} options.onSubmit - Async function that performs the API call
 * @param {Function} options.onSuccess - Optional callback on success
 * @param {Function} options.onError - Optional callback on error
 * @param {string} options.successMessage - Optional success message
 * @returns {Object} { loading, error, success, handleSubmit, clearMessages }
 */

import { useState } from 'react';

function useFormSubmit({
  onSubmit,
  onSuccess = null,
  onError = null,
  successMessage = 'Changes saved successfully!',
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e, data = null) => {
    // Prevent default form submission if event is provided
    if (e?.preventDefault) {
      e.preventDefault();
    }

    // Clear previous messages
    setError('');
    setSuccess('');

    setLoading(true);
    try {
      // Call the provided submit function
      const response = await onSubmit(data);

      // Set success message
      setSuccess(successMessage);

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(response);
      }

      return { success: true, data: response };
    } catch (err) {
      // Extract error message from response
      const errorMessage = err.response?.data?.detail ||
                          err.response?.data?.message ||
                          err.message ||
                          'An error occurred. Please try again.';

      setError(errorMessage);

      // Call onError callback if provided
      if (onError) {
        onError(err);
      }

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  return {
    loading,
    error,
    success,
    handleSubmit,
    clearMessages,
    setError,
    setSuccess,
  };
}

export default useFormSubmit;
