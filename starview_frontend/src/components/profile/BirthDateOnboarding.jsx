import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import profileApi from '../../services/profile';
import { birthDateErrorMessage } from '../../utils/birthDate';
import BirthDateDialog from './BirthDateDialog';

/**
 * Offers an optional date of birth to an account the server has just created through Google or Apple.
 * Only user.birth_date_prompt decides who is asked; the server clears it once a date is saved or the prompt is
 * dismissed, so existing accounts are never prompted. The dialog survives ordinary auth refreshes, which hand
 * over a new user object for the same account, and an account change unmounts it with the rest of the page.
 */
export default function BirthDateOnboarding() {
  const { t } = useTranslation();
  const { user, refreshAuth } = useAuth();
  const userId = user?.id ?? null;
  // closedFor: this account's prompt is finished in this tab even while a refresh still reports it.
  // attempt and notice: a dismissal the server did not record brings the prompt back, with the reason.
  const [state, setState] = useState({ closedFor: null, attempt: 0, notice: '' });
  if (user?.birth_date_prompt !== true || state.closedFor === userId) return null;

  const finish = async (outcome) => {
    setState(current => ({ ...current, closedFor: userId, notice: '' }));
    if (outcome === 'dismissed') {
      // X and Escape mean "not now". The server has to hear that too, or the prompt returns on the next visit.
      try {
        await profileApi.dismissBirthDatePrompt();
      } catch (err) {
        if (err?.code !== 'ERR_CANCELED') {
          setState(current => ({ closedFor: null, attempt: current.attempt + 1, notice: birthDateErrorMessage(err) || t('birthDate.skipFailed') }));
        }
        return;
      }
    }
    await refreshAuth();
  };

  return <BirthDateDialog key={`${userId}:${state.attempt}`} initialError={state.notice}
    onSubmit={iso => profileApi.updateBirthDate({ birth_date: iso })}
    onSkip={() => profileApi.dismissBirthDatePrompt()}
    onClose={finish} />;
}
