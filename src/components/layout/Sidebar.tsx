import {
  BarChart3,
  Bell,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { BrandMark } from '../ui/BrandMark'
import { IconButton } from '../ui/IconButton'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark />
        <div>
          <div className="brand-wordmark">SL OPTION</div>
          <div className="brand-subtitle">SIGNAL TERMINAL</div>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Primary navigation">
        <div className="sidebar__section-label">Workspace</div>
        <IconButton label="Trading room" active>
          <BarChart3 size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Dashboard">
          <LayoutDashboard size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Wallet">
          <WalletCards size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Performance">
          <Gauge size={18} strokeWidth={1.8} />
        </IconButton>

        <div className="sidebar__section-label sidebar__section-label--spaced">Account</div>
        <IconButton label="Notifications">
          <Bell size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Security">
          <ShieldCheck size={18} strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Settings">
          <Settings2 size={18} strokeWidth={1.8} />
        </IconButton>
      </nav>

      <div className="sidebar__status">
        <div className="sidebar__status-dot" />
        <span>Market link online</span>
        <CircleDollarSign size={14} />
      </div>
    </aside>
  )
}
