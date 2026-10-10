/**
 * usePrivacyPreference Hook
 *
 * React Query mutation for the signed-in user's public/private profile preference.
 * Saving only stores the preference; it does not change who can view the profile yet.
 *
 * The account the page was given (`user.is_private`) is the only source of truth. A save counts once
 * the PATCH succeeded and AuthContext has refetched the account, so a failed save never leaves the
 * control showing the new value, and nothing is kept in browser storage. A repeat request while a
 * save is in flight is ignored.
 *
 * Usage:
 *   const { isPrivate, isSaving, saveFailed, save } = usePrivacyPreference({ user, refreshAuth });
 *   if (await save(!isPrivate)) showToast('Saved', 'success');
 *
 * @param {Object} options
 * @param {Object} options.user - Authenticated account from AuthContext
 * @param {Function} options.refreshAuth - AuthContext refresh; resolves once the account is refetched
 * @returns {{isPrivate: boolean, isSaving: boolean, saveFailed: boolean, save: Function}}
 *   save(isPrivate) resolves true once the preference is saved and the account refreshed, false otherwise
 */

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { profileApi } from '../services/profile';

export function usePrivacyPreference({ user, refreshAuth }) {
  // Set synchronously, before React reports the mutation as pending, so a burst of activations sends one request.
  const inFlight = useRef(false);

  const { mutateAsync, isPending, isError, error } = useMutation({
    // Fail fast when offline so the error is shown, rather than waiting to reconnect while "Saving…".
    networkMode: 'always',
    mutationFn: async (isPrivate) => {
      const response = await profileApi.updatePrivacy({ is_private: isPrivate });
      // Stay pending until the refetched account carries the saved value.
      await refreshAuth();
      return response.data;
    },
  });

  const save = useCallback(async (isPrivate) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      await mutateAsync(isPrivate);
      return true;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [mutateAsync]);

  return {
    isPrivate: user?.is_private === true,
    isSaving: isPending,
    // A request cancelled by an account change or an expired session ends with the page, not with a message here.
    saveFailed: isError && error?.code !== 'ERR_CANCELED',
    save,
  };
}

export default usePrivacyPreference;
