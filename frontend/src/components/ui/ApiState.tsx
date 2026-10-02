import type { ReactNode } from 'react'
import type { ApiError } from '../../api/client'

type ApiStateProps = {
  loading: boolean
  error: ApiError | null
  onRetry?: () => void
  children: ReactNode
}

export function ApiState({ loading, error, onRetry, children }: ApiStateProps) {
  if (loading) {
    return <div className="dashboard-note"><span className="loading-spinner" aria-hidden="true" /> Loading live data…</div>
  }

  if (error) {
    if (error.status === 403) {
      return (
        <div className="dashboard-note" role="alert">
          <strong>Access denied.</strong> You do not have permission to view this data.
        </div>
      )
    }

    return (
      <div className="dashboard-note" role="alert">
        <strong>Data unavailable.</strong> {error.message}
        {onRetry ? <button type="button" className="quiet-button" onClick={onRetry}>Retry</button> : null}
      </div>
    )
  }

  return children
}
