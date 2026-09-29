import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './styles.css';

function SocialAccountExistsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const provider = ['apple', 'google'].includes(params.get('provider')) ? params.get('provider') : null;
  const next = provider ? `/profile?connect=${provider}` : '/profile';
  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__card glass-card">
        {/* Icon */}
        <div className="social-account-exists-icon">
          <i className="fa-solid fa-circle-info"></i>
        </div>

        {/* Title */}
        <h1 className="social-account-exists-title">Account already exists</h1>

        {/* Message */}
        <p className="social-account-exists-message">
          {t('auth.existingAccountHelp')}
        </p>

        {/* Actions */}
        <div className="social-account-exists-actions">
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="btn-primary btn-primary--full">
            <i className="fa-solid fa-right-to-bracket"></i>
            {t('auth.signInExisting')}
          </Link>
          <Link to="/password-reset" className="btn-secondary" style={{ width: '100%' }}>
            <i className="fa-solid fa-key"></i>
            Forgot password?
          </Link>
        </div>

        {/* Help Text */}
        <div className="social-account-exists-help">
          <p className="social-account-exists-help-title">Why am I seeing this?</p>
          <p className="social-account-exists-help-text">
            {t('auth.linkExplanation')}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

export default SocialAccountExistsPage;
