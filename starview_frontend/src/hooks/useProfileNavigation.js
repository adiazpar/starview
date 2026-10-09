import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** Profile back actions must consume history, never push the previous profile. */
export default function useProfileNavigation(username) {
  const navigate = useNavigate();

  const goBack = useCallback(() => {
    // BrowserRouter's index counts app entries, unlike history.length which
    // also includes external pages and entries ahead of the current page.
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const goToOwnProfile = useCallback(() => {
    // Settings can be opened directly or from somewhere other than a profile.
    // Replace it so Back cannot immediately reopen settings.
    navigate(username ? `/users/${encodeURIComponent(username)}` : '/', {
      replace: true,
    });
  }, [navigate, username]);

  return { goBack, goToOwnProfile };
}
