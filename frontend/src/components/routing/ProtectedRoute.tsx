import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../auth/useAuth'

function SessionLoading() {
  return (
    <main className="route-loading">
      <div className="route-loading__card panel">
        <span className="route-loading__mark">SL</span>
        <div>
          <span className="eyebrow">Secure session</span>
          <strong>Checking your session</strong>
          <small>Connecting to the SL Spot account service…</small>
        </div>
      </div>
    </main>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const { status } = useAuth()

  if (status === 'loading') {
    return <SessionLoading />
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname, reason: 'session_expired' }} />
  }

  return <Outlet />
}
