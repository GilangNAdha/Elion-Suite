import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../src/components/ErrorBoundary'

function Boom(): never {
  throw new Error('synthetic render crash')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing crashes', () => {
    render(
      <ErrorBoundary>
        <div>healthy content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('healthy content')).toBeTruthy()
  })

  it('replaces a render crash with a recoverable screen instead of a blank page', () => {
    // React logs caught errors to console.error; silence the expected noise.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <ErrorBoundary label="Elion Suite test">
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.getByText('Reload app')).toBeTruthy()
    // The technical detail stays available for bug reports.
    expect(screen.getByText('synthetic render crash')).toBeTruthy()
  })
})
