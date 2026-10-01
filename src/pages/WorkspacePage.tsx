import { ArrowUpRight, BarChart3, Clock3, DollarSign, PieChart, TrendingUp, WalletCards } from 'lucide-react'
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
  return (
    <div className="workspace-page">
      <header className="workspace-page__header"><div><div className="eyebrow">{props.eyebrow}</div><h1>{props.title}</h1><p>{props.description}</p></div><Link className="workspace-page__action" to="/app/trading"><BarChart3 size={15} /> Open trading room <ArrowUpRight size={14} /></Link></header>
      <div className="workspace-page__grid"><section className="workspace-card"><div className="workspace-card__icon"><BarChart3 size={17} /></div><div><strong>Frontend V1 foundation</strong><span>This route is part of the application shell and ready for its data-backed feature set.</span></div></section><section className="workspace-card"><div className="workspace-card__icon"><Clock3 size={17} /></div><div><strong>Server data not connected</strong><span>Financial values remain non-authoritative until the API, authentication, and ledger layers exist.</span></div></section></div>
    </div>
  )
}
