/**
 * ProfileSetupCard Component
 *
 * An onboarding card that guides new users through profile setup.
 * Displays completion progress and a checklist of setup tasks.
 * Styled as an observatory "instrument calibration" panel.
 *
 * Props:
 * - user: { location, bio, profile_picture_url } - User data to calculate completion
 * - onNavigateToSettings: (scrollTo?: string) => void - Navigation callback
 */

import { useMemo } from 'react';
import './styles.css';

// Define setup tasks with their completion logic
const SETUP_TASKS = [
  {
    id: 'location',
    icon: 'fa-solid fa-location-crosshairs',
    label: 'Set your location',
    description: 'Get accurate moonrise times and distances',
    field: 'location',
    scrollTo: 'location'
  },
  {
    id: 'bio',
    icon: 'fa-solid fa-pen-fancy',
    label: 'Write a bio',
    description: 'Let fellow stargazers know about you',
    field: 'bio',
    scrollTo: 'bio'
  },
  {
    id: 'picture',
    icon: 'fa-solid fa-camera',
    label: 'Add a profile photo',
    description: 'Make your profile stand out',
    field: 'profile_picture_url',
    scrollTo: 'picture',
    // Check if it's the default profile picture
    isComplete: (user) => {
      return user.profile_picture_url && !user.profile_picture_url.includes('default');
    }
  }
];

function ProfileSetupCard({ user, onNavigateToSettings }) {
  // Calculate completion status for each task
  const taskStatus = useMemo(() => {
    return SETUP_TASKS.map(task => {
      const isComplete = task.isComplete
        ? task.isComplete(user)
        : Boolean(user[task.field]);
      return { ...task, isComplete };
    });
  }, [user]);

  // Calculate overall completion percentage
  const completionPercentage = useMemo(() => {
    const completedCount = taskStatus.filter(t => t.isComplete).length;
    return Math.round((completedCount / taskStatus.length) * 100);
  }, [taskStatus]);

  // Handle individual task click - navigates to specific section
  const handleTaskClick = (scrollTo) => {
    onNavigateToSettings(scrollTo);
  };

  // Handle Open Settings button - navigates to profile page
  const handleOpenSettings = () => {
    onNavigateToSettings();
  };

  // Don't render if profile is complete
  if (completionPercentage === 100) {
    return null;
  }

  // SVG circle properties for progress ring
  const circleRadius = 38;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (completionPercentage / 100) * circumference;

  return (
    <div className="profile-setup-card-wrapper">
      <div className="profile-setup-card">
        {/* Decorative corner accents */}
        <div className="profile-setup-card__corner profile-setup-card__corner--tl"></div>
        <div className="profile-setup-card__corner profile-setup-card__corner--tr"></div>
        <div className="profile-setup-card__corner profile-setup-card__corner--bl"></div>
        <div className="profile-setup-card__corner profile-setup-card__corner--br"></div>

        {/* Header with progress ring */}
        <div className="profile-setup-card__header">
          {/* Progress Ring */}
          <div className="profile-setup-card__progress">
            <svg className="profile-setup-card__ring" viewBox="0 0 100 100">
              {/* Background track */}
              <circle
                className="profile-setup-card__ring-track"
                cx="50"
                cy="50"
                r={circleRadius}
                fill="none"
                strokeWidth="6"
              />
              {/* Progress arc */}
              <circle
                className="profile-setup-card__ring-progress"
                cx="50"
                cy="50"
                r={circleRadius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 50 50)"
              />
              {/* Center glow effect */}
              <circle
                className="profile-setup-card__ring-glow"
                cx="50"
                cy="50"
                r="30"
                fill="url(#progressGlow)"
              />
              {/* Gradient definition */}
              <defs>
                <radialGradient id="progressGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(0, 212, 170, 0.15)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
            </svg>
            {/* Percentage display */}
            <div className="profile-setup-card__percentage">
              <span className="profile-setup-card__percentage-value">{completionPercentage}</span>
              <span className="profile-setup-card__percentage-symbol">%</span>
            </div>
          </div>

          {/* Title area */}
          <div className="profile-setup-card__title-area">
            <span className="profile-setup-card__label">System Calibration</span>
            <h3 className="profile-setup-card__title">Complete Your Profile</h3>
            <p className="profile-setup-card__subtitle">
              Configure your settings for the best stargazing experience
            </p>
          </div>
        </div>

        {/* Task checklist */}
        <div className="profile-setup-card__tasks">
          {taskStatus.map((task, index) => (
            <button
              key={task.id}
              className={`profile-setup-card__task ${task.isComplete ? 'profile-setup-card__task--complete' : ''}`}
              onClick={() => handleTaskClick(task.scrollTo)}
              style={{ animationDelay: `${0.1 + index * 0.08}s` }}
            >
              {/* Status indicator */}
              <div className="profile-setup-card__task-status">
                {task.isComplete ? (
                  <i className="fa-solid fa-check"></i>
                ) : (
                  <i className={task.icon}></i>
                )}
              </div>

              {/* Task content */}
              <div className="profile-setup-card__task-content">
                <span className="profile-setup-card__task-label">{task.label}</span>
                <span className="profile-setup-card__task-description">{task.description}</span>
              </div>

              {/* Arrow indicator for incomplete tasks */}
              {!task.isComplete && (
                <i className="fa-solid fa-chevron-right profile-setup-card__task-arrow"></i>
              )}
            </button>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="profile-setup-card__footer">
          <button className="profile-setup-card__cta" onClick={handleOpenSettings}>
            <span>Open Settings</span>
            <i className="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileSetupCard;
