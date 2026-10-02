import { Bell, LogOut, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'

export function TopBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true, state: { message: 'You have been signed out.' } })
  }

  return (
    <header className="topbar">
      <Link to="/app/trading" className="topbar__brand" aria-label="SL Spot home">
        <span className="topbar__brand-name">SL<b>SPOT</b></span>
        <span className="topbar__live"><i className="live-dot" /> Live</span>
      </Link>

      <div className="topbar__spacer" />

      <Link to="/app/alerts" className="icon-button topbar__bell" aria-label="Notifications" title="Notifications">
        <Bell size={18} />
        <span className="topbar__bell-dot" />
      </Link>

      <div className="account-chip" aria-label="Signed in account">
        <span className="account-chip__body">
          <small>{user?.email ?? 'Signed in'}</small>
          <strong>{user?.status === 'ACTIVE' ? 'Account active' : 'Account'}</strong>
        </span>
      </div>

      <button className="icon-button" type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
        <LogOut size={17} />
      </button>

      <Link className="btn btn--primary topbar__deposit" to="/app/wallet">
        <Plus size={16} strokeWidth={2.6} />
        <span>Deposit</span>
      </Link>
    </header>
  )
}
