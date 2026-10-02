import { ArrowUpRight, BarChart3, Bell, Check, Clock3, DollarSign, PieChart, ShieldCheck, Smartphone, TrendingUp, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Select'

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

const walletActivity = [
  { label: 'Demo balance credit', type: 'Deposit', amount: '+$500.00', status: 'Completed', time: 'Today, 09:42', positive: true },
  { label: 'Demo withdrawal', type: 'Withdrawal', amount: '-$120.00', status: 'Pending', time: 'Yesterday, 18:20', positive: false },
  { label: 'Trading fee', type: 'Fee', amount: '-$2.40', status: 'Completed', time: 'Yesterday, 16:05', positive: false },
]

const tradeHistory = [
  { id: 'SL-4809', symbol: 'SOL/USD', side: 'UP', amount: '$50.00', result: 'Won', pnl: '+$41.00', time: '2 min ago', positive: true },
  { id: 'SL-4802', symbol: 'BTC/USD', side: 'DOWN', amount: '$25.00', result: 'Lost', pnl: '-$25.00', time: '8 min ago', positive: false },
  { id: 'SL-4796', symbol: 'EUR/USD', side: 'UP', amount: '$100.00', result: 'Won', pnl: '+$82.00', time: '14 min ago', positive: true },
  { id: 'SL-4788', symbol: 'ETH/USD', side: 'UP', amount: '$75.00', result: 'Won', pnl: '+$61.50', time: '22 min ago', positive: true },
  { id: 'SL-4771', symbol: 'BTC/USD', side: 'UP', amount: '$40.00', result: 'Lost', pnl: '-$40.00', time: '41 min ago', positive: false },
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

function StatCard({ label, value, change, positive, icon: Icon }: typeof stats[number]) {
  return (
    <section className="dashboard-stat panel">
      <div className="dashboard-stat__top"><span>{label}</span><span className="dashboard-stat__icon"><Icon size={15} /></span></div>
      <strong>{value}</strong>
      <small className={positive ? 'text-positive' : 'text-negative'}>{change}</small>
    </section>
  )
}

function PageHeader({ eyebrow, title, description, action = 'Open trading room' }: { eyebrow: string; title: string; description: string; action?: string }) {
  return <header className="workspace-page__header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> {action} <ArrowUpRight size={14} /></Link></header>
}

function DashboardPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Overview" title="Dashboard" description="Your demo trading activity, performance and market snapshot in one place." />
    <div className="dashboard-stats">{stats.map((stat) => <StatCard key={stat.label} {...stat} />)}</div>
    <div className="dashboard-grid">
      <section className="dashboard-card dashboard-card--performance panel">
        <div className="dashboard-card__header"><div><span className="eyebrow">Performance</span><h2>Weekly P&amp;L</h2></div><span className="dashboard-card__value">+$284.40</span></div>
        <div className="performance-chart" aria-label="Demo weekly performance chart"><div className="performance-chart__grid"><span /><span /><span /><span /></div><div className="performance-bars">{performance.map((item) => <div className="performance-bar-wrap" key={item.day}><div className="performance-bar" style={{ height: item.value + '%' }} /><small>{item.day}</small></div>)}</div></div>
      </section>
      <section className="dashboard-card panel">
        <div className="dashboard-card__header"><div><span className="eyebrow">Activity</span><h2>Recent trades</h2></div><Link to="/app/history" className="dashboard-link">View all <ArrowUpRight size={13} /></Link></div>
        <div className="recent-trades">{recentTrades.map((trade) => <div className="recent-trade" key={trade.symbol + trade.time}><span className="recent-trade__icon">{trade.symbol.slice(0, 1)}</span><div><strong>{trade.symbol}</strong><small>{trade.side} · {trade.amount}</small></div><span className={trade.positive ? 'text-positive' : 'text-negative'}>{trade.result}<small>{trade.time}</small></span></div>)}</div>
      </section>
    </div>
    <div className="dashboard-grid dashboard-grid--bottom">
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Markets</span><h2>Market snapshot</h2></div><Link to="/app/trading" className="dashboard-link">Trade <ArrowUpRight size={13} /></Link></div><div className="market-snapshot">{['BTC/USD','ETH/USD','SOL/USD','EUR/USD'].map((symbol, i) => <div className="market-snapshot__row" key={symbol}><strong>{symbol}</strong><span>{['113,842.12','4,216.44','246.18','1.17482'][i]}</span><span className={i === 1 ? 'text-negative' : 'text-positive'}>{['+1.82%','-0.37%','+3.21%','+0.18%'][i]}</span></div>)}</div></section>
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Risk</span><h2>Exposure</h2></div><PieChart size={16} className="dashboard-muted-icon" /></div><div className="exposure-meter"><div className="exposure-meter__track"><span style={{ width: '38%' }} /></div><div><strong>38%</strong><small>of demo balance allocated</small></div></div><div className="dashboard-note"><Clock3 size={14} /> Two positions currently open. Values are demo-only.</div></section>
    </div>
  </div>
}

function PortfolioPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Analytics" title="Performance" description="Review demo allocation, returns and position composition." />
    <div className="dashboard-stats">{stats.slice(0, 3).map((stat) => <StatCard key={stat.label} {...stat} />)}</div>
    <div className="portfolio-layout">
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Allocation</span><h2>Portfolio composition</h2></div></div><div className="holdings-list">{holdings.map((item) => <div className="holding" key={item.symbol}><span className="holding__icon">{item.symbol.slice(0,1)}</span><div className="holding__identity"><strong>{item.symbol}</strong><small>{item.name}</small></div><div className="holding__allocation"><span><b>{item.allocation}%</b><small>{item.value}</small></span><div className="allocation-track"><span style={{ width: item.allocation * 2.2 + '%' }} /></div></div><span className={item.positive ? 'text-positive' : 'text-negative'}>{item.change}</span></div>)}</div></section>
      <section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Returns</span><h2>Performance summary</h2></div><TrendingUp size={16} className="dashboard-muted-icon" /></div><div className="return-summary"><div><span>7 day return</span><strong className="text-positive">+4.82%</strong></div><div><span>Average trade</span><strong>+$23.70</strong></div><div><span>Best trade</span><strong className="text-positive">+$82.00</strong></div><div><span>Worst trade</span><strong className="text-negative">-$25.00</strong></div></div><div className="dashboard-note"><ArrowUpRight size={14} /> Demo calculations will be replaced by server-authoritative portfolio metrics.</div></section>
    </div>
  </div>
}

function WalletPage() {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('250')
  const [method, setMethod] = useState('card')
  const [destination, setDestination] = useState('')
  const [transactions, setTransactions] = useState(walletActivity)
  const [page, setPage] = useState(1)

  const submitFunding = (event: React.FormEvent) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return

    const label = mode === 'deposit' ? 'Demo deposit request' : 'Demo withdrawal request'
    const signedAmount = mode === 'deposit' ? '+$' + numericAmount.toFixed(2) : '-$' + numericAmount.toFixed(2)
    setTransactions((current) => [{
      label,
      type: mode === 'deposit' ? 'Deposit' : 'Withdrawal',
      amount: signedAmount,
      status: 'Pending',
      time: 'Just now',
      positive: mode === 'deposit',
    }, ...current])
    setAmount('')
    setDestination('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(transactions.length / 5))
  const visibleTransactions = transactions.slice((page - 1) * 5, page * 5)

  return <div className="workspace-page">
    <PageHeader eyebrow="Funds" title="Wallet" description="Manage demo funding, withdrawals and wallet activity." action="Back to trading" />
    <div className="dashboard-stats">
      {[
        { label: 'Available balance', value: '$12,480.65', note: 'Demo balance', Icon: WalletCards },
        { label: 'Available to trade', value: '$11,240.65', note: '90.1% liquid', Icon: DollarSign },
        { label: 'Pending', value: '$120.00', note: 'Withdrawal', Icon: Clock3 },
        { label: 'This month', value: '+$1,284.40', note: 'Net activity', Icon: TrendingUp },
      ].map(({ label, value, note, Icon }) => (
        <section className="dashboard-stat panel" key={label}>
          <div className="dashboard-stat__top"><span>{label}</span><span className="dashboard-stat__icon"><Icon size={15} /></span></div>
          <strong>{value}</strong>
          <small>{note}</small>
        </section>
      ))}
    </div>

    <div className="wallet-grid">
      <section className="dashboard-card panel wallet-funding-card">
        <div className="dashboard-card__header">
          <div><span className="eyebrow">Funding</span><h2>{mode === 'deposit' ? 'Deposit funds' : 'Withdraw funds'}</h2></div>
          <span className="status-pill status-pill--pending">DEMO</span>
        </div>

        <div className="wallet-mode-switch">
          <button type="button" className={mode === 'deposit' ? 'wallet-mode wallet-mode--active' : 'wallet-mode'} onClick={() => setMode('deposit')}>Deposit</button>
          <button type="button" className={mode === 'withdraw' ? 'wallet-mode wallet-mode--active' : 'wallet-mode'} onClick={() => setMode('withdraw')}>Withdraw</button>
        </div>

        <form className="wallet-funding-form" onSubmit={submitFunding}>
          <label>
            <span>Amount</span>
            <div className="wallet-amount-input"><span>$</span><input required inputMode="decimal" min="1" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div>
          </label>
          <Select
            label={mode === 'deposit' ? 'Funding method' : 'Withdrawal method'}
            value={method}
            onChange={setMethod}
            options={mode === 'deposit'
              ? [{ value: 'card', label: 'Demo card' }, { value: 'bank', label: 'Demo bank transfer' }, { value: 'crypto', label: 'Demo crypto' }]
              : [{ value: 'bank', label: 'Demo bank account' }, { value: 'crypto', label: 'Demo wallet address' }]}
          />
          {mode === 'withdraw' ? (
            <label>
              <span>Destination</span>
              <input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Demo destination" />
            </label>
          ) : (
            <div className="wallet-form-note"><Check size={15} /> Demo funding requests never move real money.</div>
          )}
          <button className="btn btn--primary" type="submit">{mode === 'deposit' ? 'Create deposit request' : 'Create withdrawal request'} <ArrowUpRight size={14} /></button>
        </form>
      </section>

      <section className="dashboard-card panel">
        <div className="dashboard-card__header">
          <div><span className="eyebrow">Security</span><h2>Funding controls</h2></div>
          <ShieldCheck size={16} className="dashboard-muted-icon" />
        </div>
        <div className="setting-row"><div><strong>Withdrawal verification</strong><small>Production withdrawals will require server-side verification.</small></div><span className="status-pill status-pill--pending">READY</span></div>
        <div className="setting-row"><div><strong>Daily withdrawal limit</strong><small>Demo limit configured for this workspace.</small></div><strong>$10,000</strong></div>
        <div className="setting-row"><div><strong>Settlement state</strong><small>All balances are demo-only until a wallet API is connected.</small></div><span className="status-pill status-pill--positive">DEMO</span></div>
      </section>
    </div>

    <section className="dashboard-card panel">
      <div className="dashboard-card__header"><div><span className="eyebrow">Transactions</span><h2>Wallet activity</h2></div><span className="status-pill status-pill--pending">{transactions.length} RECORDS</span></div>
      <div className="data-table">
        <div className="data-table__row data-table__row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>
        {visibleTransactions.map((item, index) => (
          <div className="data-table__row" key={item.label + item.time + index}>
            <div><strong>{item.label}</strong><small>{item.type}</small></div>
            <span>{item.type}</span>
            <strong className={item.positive ? 'text-positive' : 'text-negative'}>{item.amount}</strong>
            <span className={item.status === 'Pending' ? 'status-pill status-pill--pending' : 'status-pill status-pill--positive'}>{item.status}</span>
            <small>{item.time}</small>
          </div>
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </section>
  </div>
}

function HistoryPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Records" title="Trade history" description="Review completed demo trades, outcomes and settlement details." />
    <div className="history-toolbar panel"><div className="history-filter"><span>Period</span><button type="button" className="filter-chip filter-chip--active">All time</button><button type="button" className="filter-chip">Today</button><button type="button" className="filter-chip">7 days</button></div><span className="status-pill status-pill--pending">DEMO RECORDS</span></div>
    <section className="dashboard-card panel"><div className="data-table"><div className="data-table__row data-table__row--header"><span>Trade</span><span>Side</span><span>Amount</span><span>Result</span><span>P&amp;L</span></div>{tradeHistory.map((item) => <div className="data-table__row" key={item.id}><div><strong>{item.symbol}</strong><small>{item.id} · {item.time}</small></div><span className={item.side === 'UP' ? 'side-label side-label--up' : 'side-label side-label--down'}>{item.side}</span><span>{item.amount}</span><span className={item.positive ? 'status-pill status-pill--positive' : 'status-pill status-pill--negative'}>{item.result}</span><strong className={item.positive ? 'text-positive' : 'text-negative'}>{item.pnl}</strong></div>)}</div></section>
  </div>
}

function NotificationsPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Activity" title="Notifications" description="Trade, market and security events appear here in chronological order." />
    <div className="notification-layout"><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Inbox</span><h2>Recent activity</h2></div><span className="status-pill status-pill--pending">2 UNREAD</span></div><div className="notification-list">{notifications.map(({ title, copy, time, icon: Icon, unread }) => <article className={unread ? 'notification-item notification-item--unread' : 'notification-item'} key={title}><span className="notification-item__icon"><Icon size={14} /></span><div><strong>{title}</strong><p>{copy}</p><small>{time}</small></div><span className="notification-dot" /></article>)}</div></section><aside className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Preferences</span><h2>Alert channels</h2></div></div>{['Trade results','Price movement','Security events','Product updates'].map((label, index) => <div className="setting-row" key={label}><div><strong>{label}</strong><small>{index === 3 ? 'Occasional product news' : 'Demo notifications'}</small></div><span className={index === 2 ? 'toggle toggle--on' : 'toggle'}><span /></span></div>)}</aside></div>
  </div>
}

function SecurityPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Account protection" title="Security" description="Manage sign-in protection, active sessions and security events." action="Account overview" />
    <div className="security-banner panel"><span className="security-banner__icon"><WalletCards size={17} /></span><div><strong>Demo security profile</strong><p>Authentication is not connected yet. These controls preview the production security experience.</p></div><span className="status-pill status-pill--pending">NOT CONNECTED</span></div>
    <div className="settings-grid"><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Sign-in</span><h2>Authentication</h2></div></div><div className="setting-row"><div><strong>Two-factor authentication</strong><small>Add a second step to protect account access.</small></div><button type="button" className="setting-button">Enable 2FA</button></div><div className="setting-row"><div><strong>Password</strong><small>Last changed 18 days ago.</small></div><button type="button" className="setting-button">Change</button></div><div className="setting-row"><div><strong>Login alerts</strong><small>Notify when a new device signs in.</small></div><span className="toggle toggle--on"><span /></span></div></section><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Sessions</span><h2>Active devices</h2></div></div>{sessions.map((session) => { const Icon = session.icon; return <div className="session-item" key={session.device + session.lastSeen}><span className="session-item__icon"><Icon size={15} /></span><div><strong>{session.device}</strong><small>{session.location} · {session.lastSeen}</small></div>{session.current ? <span className="status-pill status-pill--positive">CURRENT</span> : <button type="button" className="setting-button setting-button--danger">Revoke</button>}</div> })}</section></div>
  </div>
}

function AccountPage() {
  return <div className="workspace-page">
    <PageHeader eyebrow="Preferences" title="Account" description="Manage your profile and workspace preferences." action="Back to trading" />
    <div className="account-layout"><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Profile</span><h2>Personal details</h2></div></div><div className="profile-card"><span className="profile-avatar">DT</span><div><strong>Demo Trader</strong><small>demo@slspot.local</small></div><span className="status-pill status-pill--positive">VERIFIED DEMO</span></div><div className="form-grid"><label><span>Display name</span><input defaultValue="Demo Trader" /></label><label><span>Email</span><input defaultValue="demo@slspot.local" type="email" /></label><label><span>Timezone</span><select defaultValue="Asia/Colombo"><option>Asia/Colombo</option><option>UTC</option><option>Europe/London</option></select></label><label><span>Currency</span><select defaultValue="USD"><option>USD</option><option>EUR</option><option>GBP</option></select></label></div><button type="button" className="setting-button setting-button--primary">Save changes</button></section><aside className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Preferences</span><h2>Workspace</h2></div></div>{['Compact trading layout','Price movement alerts','Sound effects'].map((label, index) => <div className="setting-row" key={label}><div><strong>{label}</strong><small>{index === 0 ? 'Use dense panels and tables.' : 'Demo preference.'}</small></div><span className={index < 2 ? 'toggle toggle--on' : 'toggle'}><span /></span></div>)}<div className="dashboard-note"><Clock3 size={14} /> Changes are visual only until account preferences are connected to the API.</div></aside></div>
  </div>
}

function SupportPage() {
  const faqs = [
    ['How do I place a trade?', 'Open the Trading Room, choose an asset, set the duration and amount, then review the confirmation before submitting.'],
    ['Where can I see open positions?', 'Open positions and recent activity are available in the bottom activity panel of the Trading Room.'],
    ['Are the displayed balances real?', 'No. This frontend milestone uses demo values only. Real balances will come from the authenticated wallet service.'],
    ['When will deposits be available?', 'Funding flows will be added with the wallet and payment backend integration.'],
  ]

  return <div className="workspace-page">
    <PageHeader eyebrow="Help center" title="Support" description="Find quick answers about the current trading workspace." />
    <div className="support-layout"><section className="dashboard-card panel"><div className="dashboard-card__header"><div><span className="eyebrow">Common questions</span><h2>Getting started</h2></div></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ArrowUpRight size={13} /></summary><p>{answer}</p></details>)}</div></section><aside className="dashboard-card panel support-contact"><div className="dashboard-card__header"><div><span className="eyebrow">Need help?</span><h2>Contact support</h2></div></div><p>Support messaging will be connected after the account and realtime services are available.</p><button type="button" className="setting-button setting-button--primary">Start conversation</button><div className="dashboard-note"><Clock3 size={14} /> Typical response target: under 1 business day.</div></aside></div>
  </div>
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
  return <div className="workspace-page"><PageHeader eyebrow={props.eyebrow} title={props.title} description={props.description} /></div>
}
