import profileApi from '../../../services/profile';
import CollapsibleSection from '../CollapsibleSection';
import { useToast } from '../../../contexts/ToastContext';
import './styles.css';

/**
 * ConnectedAccountsSection - Manage social account connections
 *
 * Displays connected social accounts and allows disconnection
 * Receives social accounts from parent to avoid redundant API calls
 */
function ConnectedAccountsSection({ socialAccounts = [], onRefresh }) {
  const { showToast } = useToast();

  const handleDisconnect = async (accountId, providerName) => {
    if (!window.confirm(`Are you sure you want to disconnect your ${providerName} account?`)) return;

    try {
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
    <CollapsibleSection title="Connected Accounts" defaultExpanded={false}>
      {socialAccounts.length > 0 ? (
        <div className="connected-accounts-list">
          {socialAccounts.map((account) => (
            <div key={account.id} className="connected-account-item glass-card">
              <div className="connected-account-icon">
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
                  onClick={() => handleDisconnect(account.id, account.provider_name)}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 'var(--text-sm)' }}
                >
                  <i className="fa-solid fa-unlink"></i>
                  Disconnect
                </button>
              </div>
            </div>
          ))}
          <div className="connected-accounts-note">
            <i className="fa-solid fa-circle-info"></i>
            <p>
              Your profile email may differ from your social account email. Both can be used to access your account - your profile email for password login, and your social account for OAuth login.
            </p>
          </div>
        </div>
      ) : (
        <div className="connected-accounts-empty glass-card">
          <i className="fa-solid fa-link-slash" style={{ fontSize: '2rem', color: 'var(--text-muted)', marginBottom: '12px' }}></i>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            No connected accounts yet
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Link a social account to enable faster login options
          </p>
          <a
            href="/accounts/google/login/?process=connect"
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <i className="fa-brands fa-google"></i>
            Connect Google Account
          </a>
        </div>
      )}
    </CollapsibleSection>
  );
}

export default ConnectedAccountsSection;
