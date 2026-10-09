import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type State = { failed: boolean }

/**
 * Catches a failed lazy-route load. After a new deployment the old chunk file names no longer exist, so the
 * dynamic import rejects and, without a boundary, the whole app renders blank. Offer a reload instead.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Route failed to load', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="route-loading" role="alert">
        <div className="route-loading__card panel">
          <span className="route-loading__mark">SL</span>
          <div>
            <span className="eyebrow">Something went wrong</span>
            <strong>This page could not be loaded</strong>
            <small>SL Spot may have been updated. Reload to get the latest version.</small>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </main>
    )
  }
}
