import { Bell, ChevronDown, Plus } from 'lucide-react'
import { Link } from 'react-router'

export function TopBar() {
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

      <button className="account-chip" type="button" aria-label="Switch account">
        <span className="account-chip__body">
          <small>Demo account</small>
          <strong>$12,480.65</strong>
        </span>
        <ChevronDown size={15} />
      </button>

      <Link className="btn btn--primary topbar__deposit" to="/app/wallet">
        <Plus size={16} strokeWidth={2.6} />
        <span>Deposit</span>
      </Link>
    </header>
  )
}
