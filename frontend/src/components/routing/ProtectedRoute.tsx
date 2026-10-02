import { Navigate, Outlet, useLocation } from 'react-router'

const sessionKey = 'slspot.demo.session'

export function setDemoSession(active: boolean) {
  if (active) {
    window.localStorage.setItem(sessionKey, 'active')
  } else {
    window.localStorage.removeItem(sessionKey)
  }
}

export function hasDemoSession() {
  return window.localStorage.getItem(sessionKey) === 'active'
}

export function ProtectedRoute() {
  const location = useLocation()
  if (!hasDemoSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
