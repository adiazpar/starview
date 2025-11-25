/**
 * ErrorBoundary Component
 *
 * React Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI instead of crashing the entire app.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * Props:
 * - children: React nodes
 * - fallback: React element (optional) - Custom fallback UI
 */

import { Component } from 'react';
import Alert from '../Alert';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.state = {
      hasError: true,
      error,
      errorInfo,
    };
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={{ padding: 'var(--space-xl)', maxWidth: '600px', margin: '0 auto' }}>
          <Alert
            type="error"
            message="Something went wrong. Please refresh the page or try again later."
          />
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: 'var(--space-md)', whiteSpace: 'pre-wrap' }}>
              <summary style={{ cursor: 'pointer', marginBottom: 'var(--space-sm)' }}>
                Error Details (Development Only)
              </summary>
              <code style={{
                display: 'block',
                padding: 'var(--space-md)',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--border-radius)',
                fontSize: 'var(--font-size-sm)',
                overflow: 'auto',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </code>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
