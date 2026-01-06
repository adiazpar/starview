/**
 * ProfileSettings Component
 *
 * Container component that organizes all profile settings forms in a collapsible section.
 * This component has been refactored into smaller, focused form components.
 *
 * Supports deep-linking via ?scrollTo=location query param to expand and scroll to location.
 */

import { useSearchParams } from 'react-router-dom';
import CollapsibleSection from '../CollapsibleSection';
import ProfilePictureForm from '../forms/ProfilePictureForm';
import PersonalInfoForm from '../forms/PersonalInfoForm';
import UsernameForm from '../forms/UsernameForm';
import EmailForm from '../forms/EmailForm';
import PasswordForm from '../forms/PasswordForm';
import BioForm from '../forms/BioForm';
import LocationForm from '../forms/LocationForm';
import './styles.css';

function ProfileSettings({ user, refreshAuth }) {
  const [searchParams] = useSearchParams();
  const scrollToLocation = searchParams.get('scrollTo') === 'location';

  return (
    <CollapsibleSection
      title="Profile Settings"
      defaultExpanded={scrollToLocation}
      resetOnCollapse
    >
      <div className="profile-settings-grid">
        <ProfilePictureForm user={user} refreshAuth={refreshAuth} />
        <PersonalInfoForm user={user} refreshAuth={refreshAuth} />
        <UsernameForm user={user} refreshAuth={refreshAuth} />
        <EmailForm user={user} refreshAuth={refreshAuth} />
        <PasswordForm user={user} refreshAuth={refreshAuth} />
        <BioForm user={user} refreshAuth={refreshAuth} />
        <LocationForm user={user} refreshAuth={refreshAuth} scrollTo={scrollToLocation} />
      </div>
    </CollapsibleSection>
  );
}

export default ProfileSettings;
