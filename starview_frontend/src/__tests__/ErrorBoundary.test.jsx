/**
 * ErrorBoundary Component Tests
 *
 * Tests the error boundary functionality including:
 * - Normal rendering of children
 * - Error catching and fallback UI display
 * - Custom fallback support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/shared/ErrorBoundary'

// Component that throws an error
const ThrowError = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>Child content</div>
}

// Suppress console.error for cleaner test output
const originalError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalError
})

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test child content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Test child content')).toBeInTheDocument()
  })

  it('renders fallback UI when an error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText(/Houston, We Have a/)).toBeInTheDocument()
    expect(screen.getByText(/Try refreshing the page/)).toBeInTheDocument()
    expect(screen.getByText(/try clearing your browser cache/i)).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error message')).toBeInTheDocument()
    expect(screen.queryByText(/Houston, We Have a/)).not.toBeInTheDocument()
  })

  it('logs error to console when error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(console.error).toHaveBeenCalled()
  })

  it('shows error details in development mode', () => {
    // import.meta.env.DEV is true in test environment
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // The details element should be present in dev mode
    const details = screen.getByText('Error Details (Development Only)')
    expect(details).toBeInTheDocument()
  })

  it('catches errors from deeply nested components', () => {
    const DeeplyNested = () => (
      <div>
        <div>
          <div>
            <ThrowError shouldThrow={true} />
          </div>
        </div>
      </div>
    )

    render(
      <ErrorBoundary>
        <DeeplyNested />
      </ErrorBoundary>
    )

    expect(screen.getByText(/Houston, We Have a/)).toBeInTheDocument()
  })
})
