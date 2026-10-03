import { Bell, LogOut, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { useNotifications, useWallet } from '../../hooks/useServerState'

function formatBalance(value: string | null | undefined, currency: string | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '—'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function TopBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const wallet = useWallet()
  const notifications = useNotifications(1, 1, true)
  const unreadCount = notifications.data?.pagination.total ?? 0
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const signOut = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true, state: { message: 'You have been signed out.' } })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out right now.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="topbar">
      <Link to="/app/trading" className="topbar__brand" aria-label="SL Spot home">
        <span className="topbar__brand-name">SL<b>SPOT</b></span>
        <span className="topbar__live"><i className="live-dot" /> Live</span>
      </Link>

      <div className="topbar__spacer" />

      <Link
        to="/app/alerts"
        className="icon-button topbar__bell"
        aria-label={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
        title={unreadCount > 0 ? unreadCount + ' unread notifications' : 'Notifications'}
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span className="topbar__bell-dot" /> : null}
      </Link>

      <Link to="/app/wallet" className="account-chip" aria-label="Open wallet">
        <span className="account-chip__body">
          <small>Available balance</small>
          <strong>{formatBalance(wallet.data?.availableBalance, wallet.data?.currency)}</strong>
          <em>{user?.email ?? 'Signed in'}</em>
        </span>
      </Link>

      {logoutError ? <span className="topbar__auth-error" role="alert">{logoutError}</span> : null}

      <button className="icon-button" type="button" disabled={loggingOut} onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
        <LogOut size={17} />
      </button>

      <Link className="btn btn--primary topbar__deposit" to="/app/wallet">
        <Plus size={16} strokeWidth={2.6} />
        <span>Deposit</span>
      </Link>
    </header>
  )
}
