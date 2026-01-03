/**
 * ErrorBoundary Component
 *
 * React Error Boundary that catches JavaScript errors anywhere in the child
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
import './styles.css';

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
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Use setState instead of direct mutation
    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI - matches NotFound page design
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            {/* Large error symbol */}
            <div className="error-boundary-code">
              <span className="error-boundary-bracket">!</span>
            </div>

            {/* Main message */}
            <h1 className="error-boundary-title">
              Houston, We Have a <span className="error-boundary-highlight">Problem</span>
            </h1>

            {/* Description */}
            <p className="error-boundary-message">
              Something unexpected happened. Try refreshing the page or come back later.
            </p>

            {/* Hint */}
            <p className="error-boundary-hint">
              If the problem persists, try clearing your browser cache
            </p>

            {/* Error details (dev only) */}
            {import.meta.env.DEV && this.state.error && (
              <details className="error-boundary-details">
                <summary>Error Details (Development Only)</summary>
                <code className="error-boundary-stack">
                  <strong>{this.state.error.toString()}</strong>
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </code>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
