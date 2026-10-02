import { BarChart3, Bell, Gauge, History, LayoutDashboard, LifeBuoy, Settings2, ShieldCheck, WalletCards } from 'lucide-react'
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

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof BarChart3 }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => 'rail-link' + (isActive ? ' rail-link--active' : '')}
      aria-label={label}
      title={label}
    >
      <Icon size={20} strokeWidth={1.9} />
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/app/trading" className="sidebar__brand" aria-label="SL Spot home">
        <BrandMark />
      </NavLink>

      <nav className="sidebar__nav" aria-label="Primary navigation">
        <div className="sidebar__group">
          {mainNav.map((item) => <RailLink key={item.to} {...item} />)}
        </div>
        <div className="sidebar__group sidebar__group--bottom">
          {accountNav.map((item) => <RailLink key={item.to} {...item} />)}
        </div>
      </nav>
    </aside>
  )
}
