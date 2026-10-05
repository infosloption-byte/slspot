import { BarChart3, Bell, X, Gauge, History, LayoutDashboard, LifeBuoy, Settings2, ShieldCheck, WalletCards } from 'lucide-react'
import { NavLink } from 'react-router'
import { BrandMark } from '../ui/BrandMark'

const mainNav = [
  { to: '/app/trading', label: 'Trade', icon: BarChart3 },
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/wallet', label: 'Wallet', icon: WalletCards },
  { to: '/app/history', label: 'History', icon: History },
  { to: '/app/portfolio', label: 'Performance', icon: Gauge },
]

const accountNav = [
  { to: '/app/alerts', label: 'Notifications', icon: Bell },
  { to: '/app/security', label: 'Security', icon: ShieldCheck },
  { to: '/app/account', label: 'Settings', icon: Settings2 },
  { to: '/app/support', label: 'Support', icon: LifeBuoy },
]

function RailLink({ to, label, icon: Icon, onNavigate }: { to: string; label: string; icon: typeof BarChart3; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => 'rail-link' + (isActive ? ' rail-link--active' : '')}
      aria-label={label}
      title={label}
      onClick={onNavigate}
    >
      <Icon size={20} strokeWidth={1.9} />
      <span className="rail-link__label">{label}</span>
    </NavLink>
  )
}

/**
 * Desktop: icon rail. Phone / tablet: a slide-out menu opened from the top bar's menu button.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside className={'sidebar' + (open ? ' sidebar--open' : '')} id="app-menu" aria-label="Menu">
      <div className="sidebar__head">
        <NavLink to="/app/trading" className="sidebar__brand" aria-label="SL Spot home" onClick={onClose}>
          <BrandMark />
          <span className="sidebar__brand-name">SL<b>SPOT</b></span>
        </NavLink>
        <button type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
      </div>

      <nav className="sidebar__nav" aria-label="Primary navigation">
        <div className="sidebar__group">
          {mainNav.map((item) => <RailLink key={item.to} {...item} onNavigate={onClose} />)}
        </div>
        <div className="sidebar__group sidebar__group--bottom">
          {accountNav.map((item) => <RailLink key={item.to} {...item} onNavigate={onClose} />)}
        </div>
      </nav>
    </aside>
  )
}
