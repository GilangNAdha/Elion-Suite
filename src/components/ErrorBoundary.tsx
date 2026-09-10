import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown above the technical detail so each mount point can name itself. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Last-resort crash screen. Any render error below this boundary used to
 * unmount the whole app into a blank page with no recovery path; now the
 * user gets an explanation and a one-click reload. State is local-first so
 * reloading never loses saved data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    // Kept as a single warn (not log spam): enough for bug reports, quiet otherwise.
    console.warn('[elion] recovered render crash:', error)
  }

  private retry = () => this.setState({ error: null })

  private reload = () => window.location.reload()

  render() {
    if (!this.state.error) return this.props.children
    const { error } = this.state
    return (
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
        <div className="text-lg font-semibold">Something went wrong</div>
        <p className="max-w-md text-[0.9em] text-ink-muted">
          {this.props.label ?? 'Elion Suite'} hit an unexpected error. Your saved data is stored
          locally on this device and is safe — reloading usually fixes it.
        </p>
        <details className="max-w-md rounded-lg bg-sunken px-3 py-2 text-left text-[0.78em] text-ink-faint">
          <summary className="cursor-pointer">Technical detail</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{error.message}</pre>
        </details>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={this.retry}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-[0.9em] font-medium hover:bg-sunken"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="rounded-lg bg-primary px-4 py-2 text-[0.9em] font-medium text-white"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
