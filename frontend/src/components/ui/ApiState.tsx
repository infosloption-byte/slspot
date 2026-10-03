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
    const statusCopy =
      error.status === 401
        ? { title: 'Session expired.', message: 'Please sign in again to continue.' }
        : error.status === 403
          ? { title: 'Access denied.', message: 'You do not have permission to view this data.' }
          : error.status === 408
            ? { title: 'Request timed out.', message: 'The server took too long to respond.' }
            : error.status === 429
              ? { title: 'Too many requests.', message: error.retryAfterSeconds ? 'Please retry in about ' + error.retryAfterSeconds + ' seconds.' : 'Please wait a moment before trying again.' }
              : error.status === 503
                ? { title: 'Service temporarily unavailable.', message: 'The requested service is offline or in maintenance.' }
                : error.status >= 500
                  ? { title: 'Server error.', message: 'The service could not complete this request.' }
                  : { title: 'Data unavailable.', message: error.message }

    return (
      <div className="dashboard-note" role="alert">
        <strong>{statusCopy.title}</strong> {statusCopy.message}
        {error.status !== 401 && error.status !== 403 && error.status !== 429 && onRetry ? (
          <button type="button" className="quiet-button" onClick={onRetry}>Retry</button>
        ) : null}
      </div>
    )
  }

  return children
}
