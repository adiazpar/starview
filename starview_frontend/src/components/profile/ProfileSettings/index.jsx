/**
 * ProfileSettings Component
 *
 * Container component that organizes all profile settings forms in a collapsible section.
 * This component has been refactored into smaller, focused form components.
 *
 * Supports deep-linking via ?scrollTo query param to expand and scroll to:
 * - bio: Bio form
 * - picture: Profile picture form
 */

import { useSearchParams } from 'react-router-dom';
import CollapsibleSection from '../CollapsibleSection';
import ProfilePictureForm from '../forms/ProfilePictureForm';
import PersonalInfoForm from '../forms/PersonalInfoForm';
import UsernameForm from '../forms/UsernameForm';
import EmailForm from '../forms/EmailForm';
import PasswordForm from '../forms/PasswordForm';
import BioForm from '../forms/BioForm';
import './styles.css';

function ProfileSettings({ user, refreshAuth }) {
  const [searchParams] = useSearchParams();
  const scrollToParam = searchParams.get('scrollTo');

  // Check which section to scroll to
  const scrollToBio = scrollToParam === 'bio';
  const scrollToPicture = scrollToParam === 'picture';

  // Expand section if any scrollTo param is present
  const shouldExpand = scrollToBio || scrollToPicture;

  return (
    <CollapsibleSection
      title="Profile Settings"
      defaultExpanded={shouldExpand}
      resetOnCollapse
    >
      <div className="profile-settings-grid">
        <ProfilePictureForm user={user} refreshAuth={refreshAuth} scrollTo={scrollToPicture} />
        <PersonalInfoForm user={user} refreshAuth={refreshAuth} />
        <UsernameForm user={user} refreshAuth={refreshAuth} />
        <EmailForm user={user} refreshAuth={refreshAuth} />
        <PasswordForm user={user} refreshAuth={refreshAuth} />
        <BioForm user={user} refreshAuth={refreshAuth} scrollTo={scrollToBio} />
      </div>
    </CollapsibleSection>
  );
}

export default ProfileSettings;
