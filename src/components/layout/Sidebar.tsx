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
import { NavLink } from 'react-router'
import { BrandMark } from '../ui/BrandMark'

const workspaceNav = [
  { to: '/app/trading', label: 'Trading room', icon: BarChart3 },
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/wallet', label: 'Wallet', icon: WalletCards },
  { to: '/app/portfolio', label: 'Performance', icon: Gauge },
]

const accountNav = [
  { to: '/app/alerts', label: 'Notifications', icon: Bell },
  { to: '/app/security', label: 'Security', icon: ShieldCheck },
  { to: '/app/account', label: 'Settings', icon: Settings2 },
]

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
        {workspaceNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app/trading'}
            className={({ isActive }) => 'icon-button' + (isActive ? ' icon-button--active' : '')}
            aria-label={label}
            title={label}
          >
            <Icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}

        <div className="sidebar__section-label sidebar__section-label--spaced">Account</div>
        {accountNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => 'icon-button' + (isActive ? ' icon-button--active' : '')}
            aria-label={label}
            title={label}
          >
            <Icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}

        <NavLink
          className={({ isActive }) => 'sidebar__support-link' + (isActive ? ' sidebar__support-link--active' : '')}
          to="/app/support"
          title="Support"
        >
          <CircleDollarSign size={14} />
          <span>Support</span>
        </NavLink>
      </nav>

      <div className="sidebar__status" title="Market link online">
        <div className="sidebar__status-dot" />
        <span>Market link online</span>
        <CircleDollarSign size={14} />
      </div>
    </aside>
  )
}
