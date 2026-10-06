import { useRef, useState } from 'react';
import Dialog from '../../shared/Dialog';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthProviders } from '../../../hooks/useAuthProviders';
import authApi from '../../../services/auth';
import profileApi from '../../../services/profile';
import CollapsibleSection from '../CollapsibleSection';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';
import useAccountConfirmation from '../../../hooks/useAccountConfirmation';

/**
 * ConnectedAccountsSection - Manage social account connections
 *
 * Displays connected social accounts and allows disconnection
 * Receives social accounts from parent to avoid redundant API calls
 */
function ConnectedAccountsSection({ socialAccounts = [], onRefresh }) {
  const confirmation = useAccountConfirmation();
  const disconnectDialog = useRef(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const requestedProvider = params.get('connect');
  const isGuidedLink = ['apple', 'google'].includes(requestedProvider);
  const { data: providers } = useAuthProviders();
  const connectProvider = async (provider) => {
    try {
      if (!await confirmation.confirm()) return;
      await authApi.startSocialLogin(provider, { process: 'connect', next: '/profile?social_connected=true' });
    } catch {
      showToast(t('auth.oauthError'), 'error');
    }
  };

  const handleDisconnect = async (accountId) => {
    setDisconnecting(null);

    try {
      if (!await confirmation.confirm()) return;
      const response = await profileApi.disconnectSocialAccount(accountId);
      showToast(response.data.detail, 'success');
      // Refresh the social accounts list from parent
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to disconnect account';
      showToast(errorMessage, 'error');
    }
  };

  // Map provider to icon
  const getProviderIcon = (provider) => {
    const iconMap = {
      'google': 'fa-brands fa-google',
      'apple': 'fa-brands fa-apple',
      'facebook': 'fa-brands fa-facebook',
      'github': 'fa-brands fa-github',
      'twitter': 'fa-brands fa-twitter',
    };
    return iconMap[provider.toLowerCase()] || 'fa-solid fa-link';
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <CollapsibleSection title="Connected Accounts" icon="fa-link" defaultExpanded={isGuidedLink}>
      {confirmation.dialog}
      {disconnecting && <Dialog ref={disconnectDialog} title={t('accountConfirmation.disconnectTitle')}
        onCancel={() => setDisconnecting(null)}
        footer={<div className="app-dialog-actions app-dialog-actions--spread">
          <button type="button" className="btn-secondary btn-secondary--sm" data-autofocus onClick={() => disconnectDialog.current.dismiss()}>{t('accountConfirmation.cancel')}</button>
          <button type="button" className="btn-danger btn-danger--sm" onClick={() => disconnectDialog.current.dismiss(() => handleDisconnect(disconnecting.id))}>{t('accountConfirmation.disconnect')}</button>
        </div>}>
        <p>{t('accountConfirmation.disconnectMessage', { provider: disconnecting.provider_name })}</p>
      </Dialog>}
      {isGuidedLink && <p>{t('auth.finishLink')}</p>}
      <div className="profile-form-section">
        <h3 className="profile-form-title">{t('profileSettings.signInAccounts')}</h3>
        <p className="profile-form-description">{t('profileSettings.connectedAccountsDescription')}</p>
        {socialAccounts.length > 0 ? (
          <div className="connected-accounts-list profile-form-controls">
            {socialAccounts.map((account) => (
              <div key={account.id} className="connected-account-item glass-card">
                <div className="connected-account-icon" aria-hidden="true">
                  <i className={getProviderIcon(account.provider)}></i>
                </div>
                <div className="connected-account-info">
                  <h4>{account.provider_name}</h4>
                  <p className="connected-account-email">{account.email}</p>
                  <p className="connected-account-date">
                    Connected {formatDate(account.connected_at)}
                  </p>
                </div>
                <div className="connected-account-actions">
                  <button
                    onClick={() => setDisconnecting(account)}
                    className="btn-secondary btn-secondary--sm"
                  >
                    <i className="fa-solid fa-unlink" aria-hidden="true"></i>
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="connected-accounts-empty glass-card profile-form-controls">
            <i className="fa-solid fa-link-slash" style={{ fontSize: '2rem', color: 'var(--text-muted)', marginBottom: '12px' }}></i>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              No connected accounts yet
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Link a social account to enable faster login options
            </p>

          </div>
        )}
        <div className="connected-account-options">
          {!socialAccounts.some(account => account.provider === 'google') && (
            <button type="button" onClick={() => connectProvider('google')} className="btn-secondary">
              <i className="fa-brands fa-google" aria-hidden="true"></i> {t('auth.connectGoogle')}
            </button>
          )}
          {providers?.apple && !socialAccounts.some(account => account.provider === 'apple') && (
            <button type="button" className="btn-secondary" onClick={() => connectProvider('apple')}>
              <i className="fa-brands fa-apple" aria-hidden="true"></i> {t('auth.connectApple')}
            </button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default ConnectedAccountsSection;
