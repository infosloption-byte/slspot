import { Bell, ChevronDown, Command, Search, Sparkles, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { IconButton } from '../ui/IconButton'

export function TopBar() {
  return (
    <header className="topbar">
      <button className="topbar__search" type="button" title="Search markets">
        <Search size={16} aria-hidden="true" />
        <span>Search markets</span>
        <kbd aria-hidden="true"><Command size={11} /> K</kbd>
      </button>

      <div className="topbar__spacer" />

      <div className="topbar__market-status" aria-label="Market status">
        <span className="status-pulse" />
        <span>Demo market online</span>
      </div>

      <Link className="topbar__icon-link" to="/app/alerts">
        <IconButton label="Notifications">
          <Bell size={17} />
        </IconButton>
      </Link>

      <Link className="wallet-chip" to="/app/wallet" aria-label="Open wallet">
        <span className="wallet-chip__icon"><Wallet size={15} /></span>
        <span className="wallet-chip__copy">
          <span className="wallet-chip__label">Available</span>
          <strong>$12,480.65</strong>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </Link>

      <button className="upgrade-chip" type="button" title="Pro workspace">
        <Sparkles size={15} aria-hidden="true" />
        <span>Pro workspace</span>
      </button>
    </header>
  )
}
