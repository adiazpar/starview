import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';

/** Share a public link, falling back to copying it when native sharing fails. */
export default function useShareLink() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  return useCallback(async (data) => {
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      // Cancelling a share sheet is intentional, not a reason to copy the link.
      if (error.name === 'AbortError') return;
    }

    try {
      await navigator.clipboard.writeText(data.url);
      showToast(t('sharing.linkCopied'), 'success');
    } catch {
      showToast(t('sharing.failed'), 'error');
    }
  }, [showToast, t]);
}
