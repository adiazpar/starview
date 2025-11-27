import { Link, useSearchParams, Navigate } from 'react-router-dom';
import './styles.css';

function EmailConfirmErrorPage() {
  const [searchParams] = useSearchParams();
  const errorType = searchParams.get('error');

  // If no error type, redirect to login
  if (!errorType) {
    return <Navigate to="/login" replace />;
  }

  const getErrorContent = () => {
    if (errorType === 'expired') {
      return {
        icon: 'fa-solid fa-clock-rotate-left',
        iconClass: 'email-confirm-error-icon--expired',
        title: 'Link expired',
        message: 'This email confirmation link has expired or is invalid. Email confirmation links expire after 3 days for security reasons.',
        actionText: 'Go to login',
        actionLink: '/login',
        showHelp: true
      };
    } else if (errorType === 'already_confirmed') {
      return {
        icon: 'fa-solid fa-triangle-exclamation',
        iconClass: '',
        title: 'Already confirmed',
        message: 'This email address has already been confirmed by a different account. If you believe this is an error, please contact support.',
        actionText: 'Go to login',
        actionLink: '/login',
        showHelp: false
      };
    }

    // Default error
    return {
      icon: 'fa-solid fa-circle-exclamation',
      iconClass: 'email-confirm-error-icon--error',
      title: 'Confirmation error',
      message: 'There was a problem confirming your email address. Please try again or contact support.',
      actionText: 'Go to login',
      actionLink: '/login',
      showHelp: true
    };
  };

  const content = getErrorContent();

  return (
    <div className="email-confirm-error-container">
      <div className="email-confirm-error-content">
        <div className="email-confirm-error-card">
        {/* Error Icon */}
        <div className={`email-confirm-error-icon ${content.iconClass}`}>
          <i className={content.icon}></i>
        </div>

        {/* Title */}
        <h1 className="email-confirm-error-title">{content.title}</h1>

        {/* Message */}
        <p className="email-confirm-error-message">
          {content.message}
        </p>

        {/* Actions */}
        <div className="email-confirm-error-actions">
          <Link to={content.actionLink} className="btn-primary btn-primary--full">
            {content.actionText}
          </Link>
        </div>

        {/* Additional Help */}
        {content.showHelp && (
          <p className="email-confirm-error-help">
            Please contact support if you need assistance.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

export default EmailConfirmErrorPage;
