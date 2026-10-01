import { ArrowDownToLine, ArrowUpRight, Bell, Check, ChevronRight, Clock3, BarChart3, DollarSign, LockKeyhole, Mail, PieChart, Plus, ShieldCheck, Smartphone, TrendingUp, UserRound, WalletCards } from 'lucide-react'
import { Link } from 'react-router'

type WorkspacePageProps = {
  eyebrow: string
  title: string
  description: string
}

const stats = [
  { label: 'Demo balance', value: '$12,480.65', change: '+4.82%', positive: true, icon: WalletCards },
  { label: 'Today P&L', value: '+$284.40', change: '+2.31%', positive: true, icon: TrendingUp },
  { label: 'Win rate', value: '68.4%', change: '+3.8%', positive: true, icon: BarChart3 },
  { label: 'Open exposure', value: '$1,240.00', change: '2 positions', positive: true, icon: DollarSign },
]

const performance = [
  { day: 'Mon', value: 42 }, { day: 'Tue', value: 68 }, { day: 'Wed', value: 51 },
  { day: 'Thu', value: 86 }, { day: 'Fri', value: 74 }, { day: 'Sat', value: 94 }, { day: 'Sun', value: 88 },
]

const recentTrades = [
  { symbol: 'SOL/USD', side: 'UP', amount: '$50.00', result: '+$41.00', time: '2 min ago', positive: true },
  { symbol: 'BTC/USD', side: 'DOWN', amount: '$25.00', result: '-$25.00', time: '8 min ago', positive: false },
  { symbol: 'EUR/USD', side: 'UP', amount: '$100.00', result: '+$82.00', time: '14 min ago', positive: true },
  { symbol: 'ETH/USD', side: 'UP', amount: '$75.00', result: '+$61.50', time: '22 min ago', positive: true },
]

const holdings = [
  { symbol: 'BTC/USD', name: 'Bitcoin', value: '$5,120.40', allocation: 41, change: '+6.2%', positive: true },
  { symbol: 'ETH/USD', name: 'Ethereum', value: '$3,214.20', allocation: 26, change: '+1.8%', positive: true },
  { symbol: 'SOL/USD', name: 'Solana', value: '$2,486.00', allocation: 20, change: '+8.4%', positive: true },
  { symbol: 'Cash', name: 'Available balance', value: '$1,660.05', allocation: 13, change: 'Liquid', positive: true },
]

function StatCard({ label, value, change, positive, icon: Icon }: typeof stats[number]) {
  return (
    <section className="dashboard-stat panel">
      <div className="dashboard-stat__top"><span>{label}</span><span className="dashboard-stat__icon"><Icon size={15} /></span></div>
      <strong>{value}</strong>
      <small className={positive ? 'text-positive' : 'text-negative'}>{change}</small>
    </section>
  )
}


const walletActivity = [
  { label: 'Demo balance credit', type: 'Deposit', amount: '+$500.00', status: 'Completed', time: 'Today, 09:42', positive: true },
  { label: 'Demo withdrawal', type: 'Withdrawal', amount: '-$120.00', status: 'Pending', time: 'Yesterday, 18:20', positive: false },
  { label: 'Trading fee', type: 'Fee', amount: '-$2.40', status: 'Completed', time: 'Yesterday, 16:05', positive: false },
]

const notifications = [
  { title: 'Position settled', copy: 'Your SOL/USD UP position closed with a +$41.00 demo result.', time: '2 min ago', icon: Check, unread: true },
  { title: 'Security check', copy: 'A new browser session was detected on this demo account.', time: '18 min ago', icon: ShieldCheck, unread: true },
  { title: 'Market alert', copy: 'BTC/USD moved above the demo alert level of $113,800.', time: '42 min ago', icon: Bell, unread: false },
  { title: 'System update', copy: 'Realtime market streaming is currently running in demo mode.', time: '1 hr ago', icon: Clock3, unread: false },
]

const sessions = [
  { device: 'Chrome on Windows', location: 'Current session', lastSeen: 'Active now', icon: Smartphone, current: true },
  { device: 'Chrome on Windows', location: 'Previous browser session', lastSeen: 'Yesterday, 18:42', icon: Smartphone, current: false },
]

function WorkspaceHeader({ eyebrow, title, description, action = 'Open trading room' }: { eyebrow: string; title: string; description: string; action?: string }) {
  return (
    <header className="workspace-page__header">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
      <Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> {action} <ArrowUpRight size={14} /></Link>
    </header>
  )
}

function WalletPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Funds" title="Wallet" description="Manage your demo balance and review wallet activity. Live deposits and withdrawals will be server-authoritative." action="Back to trading" />
    <div className="wallet-summary">
      <section className="dashboard-card panel wallet-balance"><span>Available demo balance</span><strong>$12,480.65</strong><small>Updated from the demo ledger · not real funds</small><div><button type="button"><Plus size={14} /> Add funds</button><button type="button" className="wallet-secondary"><ArrowDownToLine size={14} /> Withdraw</button></div></section>
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Breakdown</span><h2>Balance overview</h2></div><WalletCards size={16} className="dashboard-muted-icon" /></div><div className="wallet-breakdown"><span><small>Trading balance</small><strong>$10,820.60</strong></span><span><small>Reserved exposure</small><strong>$1,240.00</strong></span><span><small>Available cash</small><strong>$420.05</strong></span></div></section>
    </div>
    <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Ledger</span><h2>Wallet activity</h2></div><span className="demo-badge">Demo data</span></div><div className="activity-table wallet-activity"><div className="activity-row activity-row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>{walletActivity.map((item) => <div className="activity-row" key={item.label}><span><strong>{item.label}</strong></span><span>{item.type}</span><span className={item.positive ? 'text-positive' : 'text-negative'}>{item.amount}</span><span><b className={item.status === 'Pending' ? 'status-pill status-pill--pending' : 'status-pill status-pill--positive'}>{item.status}</b></span><span>{item.time}</span></div>)}</div></section>
  </div>
}

function HistoryPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Records" title="Trade history" description="Review completed demo trades, outcomes and settlement records." />
    <div className="history-toolbar panel"><div className="history-filter active">All trades</div><div className="history-filter">Won</div><div className="history-filter">Lost</div><span className="history-toolbar__spacer" /><span className="demo-badge">Demo ledger</span></div>
    <section className="dashboard-card panel"><div className="activity-table history-activity"><div className="activity-row activity-row--header"><span>Trade</span><span>Side</span><span>Amount</span><span>Result</span><span>Time</span></div>{[['SOL/USD','UP','$50.00','+$41.00','Won','2 min ago'],['BTC/USD','DOWN','$25.00','-$25.00','Lost','8 min ago'],['EUR/USD','UP','$100.00','+$82.00','Won','14 min ago'],['ETH/USD','UP','$75.00','+$61.50','Won','22 min ago']].map(([symbol,side,amount,pnl,result,time]) => <div className="activity-row" key={symbol + time}><span><strong>{symbol}</strong><small>{amount}</small></span><span className={side === 'UP' ? 'text-positive' : 'text-negative'}>{side}</span><span>{amount}</span><span className={result === 'Won' ? 'status-pill status-pill--positive' : 'status-pill status-pill--negative'}>{pnl}</span><span>{time}</span></div>)}</div></section>
  </div>
}

function NotificationsPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Activity" title="Notifications" description="Trade, security and system events will be delivered through the realtime notification service." />
    <section className="notification-list panel">{notifications.map(({ title, copy, time, icon: Icon, unread }) => <article className={unread ? 'notification notification--unread' : 'notification'} key={title}><span className="notification__icon"><Icon size={15} /></span><div><strong>{title}</strong><p>{copy}</p><small>{time}</small></div>{unread && <span className="notification__dot" />}</article>)}</section>
  </div>
}

function SecurityPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Account protection" title="Security" description="Review account protection settings, active sessions and authentication controls." />
    <div className="settings-grid">
      <section className="settings-card panel"><div className="settings-card__header"><span className="settings-icon"><LockKeyhole size={16} /></span><div><strong>Password</strong><small>Last changed 30 days ago</small></div><ChevronRight size={15} /></div><button type="button" className="settings-button">Change password</button></section>
      <section className="settings-card panel"><div className="settings-card__header"><span className="settings-icon"><ShieldCheck size={16} /></span><div><strong>Two-factor authentication</strong><small>Not configured in demo mode</small></div><span className="status-pill status-pill--pending">Off</span></div><button type="button" className="settings-button">Configure 2FA</button></section>
    </div>
    <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Sessions</span><h2>Active devices</h2></div><span className="demo-badge">Demo account</span></div><div className="session-list">{sessions.map((session) => <div className="session-row" key={session.device + session.lastSeen}><span className="settings-icon"><session.icon size={15} /></span><div><strong>{session.device}</strong><small>{session.location} · {session.lastSeen}</small></div>{session.current ? <span className="status-pill status-pill--positive">Current</span> : <button className="session-revoke" type="button">Revoke</button>}</div>)}</div></section>
  </div>
}

function AccountPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Preferences" title="Account" description="Manage your profile and application preferences. Changes will be persisted by the account API later." />
    <div className="settings-grid settings-grid--account">
      <section className="dashboard-card panel profile-card"><span className="profile-avatar"><UserRound size={23} /></span><div><span className="eyebrow">Profile</span><h2>Demo Trader</h2><p>demo@slspot.local</p></div><span className="demo-badge">Demo</span></section>
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Preferences</span><h2>Trading defaults</h2></div></div><div className="preference-row"><span>Default market</span><strong>BTC/USD</strong><ChevronRight size={14} /></div><div className="preference-row"><span>Default duration</span><strong>60 seconds</strong><ChevronRight size={14} /></div><div className="preference-row"><span>Notifications</span><strong>Enabled</strong><ChevronRight size={14} /></div></section>
    </div>
  </div>
}

function SupportPage() {
  return <div className="workspace-page">
    <WorkspaceHeader eyebrow="Help center" title="Support" description="Find answers about the demo terminal or prepare a support request for the production service." />
    <div className="support-grid"><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Common questions</span><h2>Quick help</h2></div></div>{['How do demo trades settle?','Where can I review my trade history?','How will live deposits work?','How do I secure my account?'].map((q) => <div className="support-question" key={q}><span>{q}</span><ChevronRight size={14} /></div>)}</section><section className="dashboard-card panel support-contact"><span className="settings-icon"><Mail size={17} /></span><h2>Contact support</h2><p>Production support conversations will be connected to the authenticated support service.</p><button type="button" className="workspace-page__action"><Mail size={14} /> Start a request</button></section></div>
  </div>
}

function DashboardPage() {
  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <div><div className="eyebrow">Overview</div><h1>Dashboard</h1><p>Your demo trading activity, performance and market snapshot in one place.</p></div>
        <Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> Open trading room <ArrowUpRight size={14} /></Link>
      </header>

      <div className="dashboard-stats">{stats.map((stat) => <StatCard key={stat.label} {...stat} />)}</div>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card--performance panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Performance</span><h2>Weekly P&amp;L</h2></div><span className="dashboard-card__value">+$284.40</span></div>
          <div className="performance-chart" aria-label="Demo weekly performance chart">
            <div className="performance-chart__grid"><span /><span /><span /><span /></div>
            <div className="performance-bars">{performance.map((item) => <div className="performance-bar-wrap" key={item.day}><div className="performance-bar" style={{ height: item.value + '%' }} /><small>{item.day}</small></div>)}</div>
          </div>
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Activity</span><h2>Recent trades</h2></div><Link to="/app/history" className="dashboard-link">View all <ArrowUpRight size={13} /></Link></div>
          <div className="recent-trades">{recentTrades.map((trade) => <div className="recent-trade" key={trade.symbol + trade.time}><span className="recent-trade__icon">{trade.symbol.slice(0, 1)}</span><div><strong>{trade.symbol}</strong><small>{trade.side} · {trade.amount}</small></div><span className={trade.positive ? 'text-positive' : 'text-negative'}>{trade.result}<small>{trade.time}</small></span></div>)}</div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--bottom">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Markets</span><h2>Market snapshot</h2></div><Link to="/app/trading" className="dashboard-link">Trade <ArrowUpRight size={13} /></Link></div>
          <div className="market-snapshot">{['BTC/USD','ETH/USD','SOL/USD','EUR/USD'].map((symbol, i) => <div className="market-snapshot__row" key={symbol}><strong>{symbol}</strong><span>{['113,842.12','4,216.44','246.18','1.17482'][i]}</span><span className={i === 1 ? 'text-negative' : 'text-positive'}>{['+1.82%','-0.37%','+3.21%','+0.18%'][i]}</span></div>)}</div>
        </section>
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Risk</span><h2>Exposure</h2></div><PieChart size={16} className="dashboard-muted-icon" /></div>
          <div className="exposure-meter"><div className="exposure-meter__track"><span style={{ width: '38%' }} /></div><div><strong>38%</strong><small>of demo balance allocated</small></div></div>
          <div className="dashboard-note"><Clock3 size={14} /> Two positions currently open. Values are demo-only.</div>
        </section>
      </div>
    </div>
  )
}

function PortfolioPage() {
  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <div><div className="eyebrow">Analytics</div><h1>Performance</h1><p>Review demo allocation, returns and position composition.</p></div>
        <Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> Open trading room <ArrowUpRight size={14} /></Link>
      </header>
      <div className="dashboard-stats">{stats.slice(0, 3).map((stat) => <StatCard key={stat.label} {...stat} />)}</div>
      <div className="portfolio-layout">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Allocation</span><h2>Portfolio composition</h2></div></div>
          <div className="holdings-list">{holdings.map((item) => <div className="holding" key={item.symbol}><span className="holding__icon">{item.symbol.slice(0,1)}</span><div className="holding__identity"><strong>{item.symbol}</strong><small>{item.name}</small></div><div className="holding__allocation"><span><b>{item.allocation}%</b><small>{item.value}</small></span><div className="allocation-track"><span style={{ width: item.allocation * 2.2 + '%' }} /></div></div><span className={item.positive ? 'text-positive' : 'text-negative'}>{item.change}</span></div>)}</div>
        </section>
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Returns</span><h2>Performance summary</h2></div><TrendingUp size={16} className="dashboard-muted-icon" /></div>
          <div className="return-summary"><div><span>7 day return</span><strong className="text-positive">+4.82%</strong></div><div><span>Average trade</span><strong>+$23.70</strong></div><div><span>Best trade</span><strong className="text-positive">+$82.00</strong></div><div><span>Worst trade</span><strong className="text-negative">-$25.00</strong></div></div>
          <div className="dashboard-note"><ArrowUpRight size={14} /> Demo calculations will be replaced by server-authoritative portfolio metrics.</div>
        </section>
      </div>
    </div>
  )
}

export function WorkspacePage(props: WorkspacePageProps) {
  if (props.title === 'Dashboard') return <DashboardPage />
  if (props.title === 'Performance') return <PortfolioPage />
  if (props.title === 'Wallet') return <WalletPage />
  if (props.title === 'Trade history') return <HistoryPage />
  if (props.title === 'Notifications') return <NotificationsPage />
  if (props.title === 'Security') return <SecurityPage />
  if (props.title === 'Account') return <AccountPage />
  if (props.title === 'Support') return <SupportPage />
  return (
    <div className="workspace-page">
      <header className="workspace-page__header"><div><div className="eyebrow">{props.eyebrow}</div><h1>{props.title}</h1><p>{props.description}</p></div><Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> Open trading room <ArrowUpRight size={14} /></Link></header>
      <div className="workspace-page__grid"><section className="workspace-card"><div className="workspace-card__icon"><BarChart3 size={17} /></div><div><strong>Frontend V1 foundation</strong><span>This route is part of the application shell and ready for its data-backed feature set.</span></div></section><section className="workspace-card"><div className="workspace-card__icon"><Clock3 size={17} /></div><div><strong>Server data not connected</strong><span>Financial values remain non-authoritative until the API, authentication, and ledger layers exist.</span></div></section></div>
    </div>
  )
}
