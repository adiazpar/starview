/**
 * ErrorBoundary Component Tests
 *
 * Tests the error boundary functionality including:
 * - Normal rendering of children
 * - Error catching and fallback UI display
 * - Retry functionality
 * - Custom fallback support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /Refresh Page/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument()
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

  it('resets error state when Try Again is clicked and error is resolved', () => {
    // Use a ref to control whether component throws
    let shouldThrow = true

    const ConditionalThrow = () => {
      if (shouldThrow) {
        throw new Error('Test error')
      }
      return <div>Child content</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    )

    // Verify error state
    expect(screen.getByText(/Houston, We Have a/)).toBeInTheDocument()

    // "Fix" the underlying issue
    shouldThrow = false

    // Click Try Again - this should now render successfully
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }))

    // Force a rerender to pick up the state change
    rerender(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    )

    // Should show children again since the error is now resolved
    expect(screen.getByText('Child content')).toBeInTheDocument()
    expect(screen.queryByText(/Houston, We Have a/)).not.toBeInTheDocument()
  })

  it('calls window.location.reload when Refresh Page is clicked', () => {
    // Mock window.location.reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: /Refresh Page/i }))

    expect(reloadMock).toHaveBeenCalled()
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
