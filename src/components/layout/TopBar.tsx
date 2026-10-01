import { Bell, ChevronDown, Command, Search, Sparkles, Wallet } from 'lucide-react'
import { IconButton } from '../ui/IconButton'

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__search">
        <Search size={17} />
        <span>Search markets</span>
        <kbd><Command size={11} /> K</kbd>
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__market-status">
        <span className="status-pulse" />
        Live market data
      </div>

      <IconButton label="Notifications">
        <Bell size={17} />
      </IconButton>

      <button className="wallet-chip" type="button">
        <span className="wallet-chip__icon"><Wallet size={15} /></span>
        <span>
          <span className="wallet-chip__label">Available</span>
          <strong>$12,480.65</strong>
        </span>
        <ChevronDown size={15} />
      </button>

      <button className="upgrade-chip" type="button">
        <Sparkles size={15} />
        Pro workspace
      </button>
    </header>
  )
}
