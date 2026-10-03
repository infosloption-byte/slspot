import { ArrowDownCircle, ArrowUpCircle, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, Clock3, Download, DollarSign, PieChart, Search, ShieldCheck, Smartphone, TrendingUp, WalletCards } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Pagination } from '../components/ui/Pagination'
import { ApiState } from '../components/ui/ApiState'
import { Toast } from '../components/ui/Toast'
import { formatPrice } from '../lib/format'
import { notificationsApi } from '../api/notifications'
import { authApi } from '../api/auth'
import { tradesApi } from '../api/trades'
import { walletApi, type WalletTransactionFilters } from '../api/wallet'
import { useAuth } from '../auth/useAuth'
import { useWalletMode } from '../hooks/useWalletMode'
import { useRealtime } from '../realtime/useRealtime'
import { userChannel } from '../realtime/subscriptions'
import { useAuthDevices, useAuthSessions, useLoginHistory, useMarketAssets, useNotifications, usePortfolioAnalytics, usePortfolioPositions, usePortfolioSummary, useSecurityEvents, useTrades, useTwoFactorStatus, useWallet, useWalletTransactions, useWallets } from '../hooks/useServerState'

type WorkspacePageProps = {
  eyebrow: string
  title: string
  description: string
}

const iconForNotification = {
  TRADE_RESULT: Check,
  DEPOSIT: WalletCards,
  WITHDRAWAL: WalletCards,
  SECURITY: ShieldCheck,
  VERIFICATION: Check,
  SYSTEM: Bell,
} as const

function PageHeader({
  eyebrow,
  title,
  description,
  action = 'Open trading room',
}: {
  eyebrow: string
  title: string
  description: string
  action?: string
}) {
  return (
    <header className="workspace-page__header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <Link className="workspace-page__action" to="/app/trading">
        <BarChart3 size={15} /> {action} <ArrowUpRight size={14} />
      </Link>
    </header>
  )
}

type ThemedSelectOption = {
  value: string
  label: string
}

function ThemedSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="trade-history-control" ref={rootRef}>
      <span>{label}</span>
      <div className="trade-history-select">
        <button
          type="button"
          className={open ? 'trade-history-select__trigger trade-history-select__trigger--open' : 'trade-history-select__trigger'}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label ?? 'Select'}</span>
          <ArrowDownCircle size={14} aria-hidden="true" />
        </button>
        {open ? (
          <div className="trade-history-select__menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'trade-history-select__option trade-history-select__option--active' : 'trade-history-select__option'}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  change,
  positive,
  icon: Icon,
}: {
  label: string
  value: string
  change: string
  positive: boolean
  icon: typeof WalletCards
}) {
  return (
    <section className="dashboard-stat panel">
      <div className="dashboard-stat__top">
        <span>{label}</span>
        <span className="dashboard-stat__icon"><Icon size={15} /></span>
      </div>
      <strong>{value}</strong>
      <small className={positive ? 'text-positive' : 'text-negative'}>{change}</small>
    </section>
  )
}

function Sparkline({ series, currency }: {
  series: Array<{ date: string; cumulativePnl: string }>
  currency: string
}) {
  const values = series.map((point) => Number(point.cumulativePnl))
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const points = series.length
    ? series.map((point, index) => {
        const x = series.length === 1 ? 50 : index / (series.length - 1) * 100
        const y = 90 - ((Number(point.cumulativePnl) - min) / range) * 75
        return x.toFixed(2) + ',' + y.toFixed(2)
      }).join(' ')
    : ''

  return (
    <div className="dashboard-chart">
      <div className="dashboard-chart__meta">
        <span>30-day cumulative P&amp;L</span>
        <strong className={Number(series.at(-1)?.cumulativePnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>
          {signedMoney(series.at(-1)?.cumulativePnl)}
        </strong>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Thirty day cumulative P&L chart">
        <line x1="0" y1="90" x2="100" y2="90" />
        {points ? <polyline points={points} /> : null}
      </svg>
      <div className="dashboard-chart__labels">
        <span>{series[0]?.date ?? '—'}</span>
        <span>{currency}</span>
        <span>{series.at(-1)?.date ?? '—'}</span>
      </div>
    </div>
  )
}

function DashboardPage() {
  const summary = usePortfolioSummary()
  const analytics = usePortfolioAnalytics()
  const trades = useTrades(1, 8)
  const markets = useMarketAssets(10)

  const loading = summary.loading || analytics.loading || trades.loading
  const error = summary.error ?? analytics.error ?? trades.error

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Server-backed account value, realized performance and trading activity."
      />

      <ApiState
        loading={loading}
        error={error}
        onRetry={() => {
          void summary.reload()
          void analytics.reload()
          void trades.reload()
        }}
      >
        <div className="dashboard-stats dashboard-stats--six">
          <StatCard label="Portfolio value" value={formatMoney(summary.data?.totalBalance, summary.data?.currency)} change={summary.data?.currency ?? 'USD'} positive icon={WalletCards} />
          <StatCard label="Trading balance" value={formatMoney(summary.data?.availableBalance, summary.data?.currency)} change="Available to trade" positive icon={DollarSign} />
          <StatCard label="Today's P&amp;L" value={signedMoney(analytics.data?.dailyPnl)} change="Realized today" positive={Number(analytics.data?.dailyPnl ?? 0) >= 0} icon={TrendingUp} />
          <StatCard label="Win / loss" value={(analytics.data?.wins ?? 0) + ' / ' + (analytics.data?.losses ?? 0)} change={(analytics.data?.winRate ?? '0') + '% win rate'} positive icon={BarChart3} />
          <StatCard label="Trade volume" value={formatMoney(analytics.data?.volume, analytics.data?.currency)} change="Last 30 days" positive icon={ArrowUpCircle} />
          <StatCard label="Trade count" value={String(analytics.data?.tradeCount ?? summary.data?.tradeCount ?? 0)} change={(summary.data?.openPositionCount ?? 0) + ' open positions'} positive icon={Clock3} />
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-card dashboard-card--performance panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Performance</span><h2>Realized P&amp;L</h2></div>
              <Link to="/app/portfolio" className="dashboard-link">Analytics <ArrowUpRight size={13} /></Link>
            </div>
            <Sparkline series={analytics.data?.series ?? []} currency={analytics.data?.currency ?? 'USD'} />
            <div className="return-summary">
              <div><span>Daily</span><strong className={Number(analytics.data?.dailyPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(analytics.data?.dailyPnl)}</strong></div>
              <div><span>Weekly</span><strong className={Number(analytics.data?.weeklyPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(analytics.data?.weeklyPnl)}</strong></div>
              <div><span>Monthly</span><strong className={Number(analytics.data?.monthlyPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(analytics.data?.monthlyPnl)}</strong></div>
            </div>
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Activity</span><h2>Recent trades</h2></div>
              <Link to="/app/history" className="dashboard-link">View all <ArrowUpRight size={13} /></Link>
            </div>
            <div className="recent-trades">
              {(trades.data?.items ?? []).slice(0, 6).map((trade) => (
                <div className="recent-trade" key={trade.id}>
                  <span className="recent-trade__icon">{trade.position.asset.symbol.slice(0, 1)}</span>
                  <div>
                    <strong>{trade.position.asset.symbol}</strong>
                    <small>{trade.direction} · {formatMoney(trade.amount)} · {trade.status}</small>
                  </div>
                  <span className={Number(trade.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>
                    {signedMoney(trade.netPnl)}
                    <small>{formatDateTime(trade.closedAt ?? trade.openedAt)}</small>
                  </span>
                </div>
              ))}
              {trades.data?.items.length === 0 ? <div className="dashboard-note">No trades have been recorded yet.</div> : null}
            </div>
          </section>
        </div>

        <div className="dashboard-grid dashboard-grid--bottom">
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Markets</span><h2>Market snapshot</h2></div>
              <Link to="/app/trading" className="dashboard-link">Trade <ArrowUpRight size={13} /></Link>
            </div>
            <ApiState loading={markets.loading} error={markets.error} onRetry={() => void markets.reload()}>
              <div className="market-snapshot">
                {(markets.data?.items ?? []).slice(0, 5).map((asset) => (
                  <div className="market-snapshot__row" key={asset.assetId}>
                    <strong>{asset.symbol}</strong>
                    <span>{asset.market?.lastPrice ? formatPrice(Number(asset.market.lastPrice), asset.priceScale > 4 ? 5 : 2) : '—'}</span>
                    <span>{asset.market?.status ?? 'CLOSED'}</span>
                  </div>
                ))}
                {markets.data?.items.length === 0 ? <div className="dashboard-note">No active market assets are configured.</div> : null}
              </div>
            </ApiState>
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Portfolio</span><h2>Account composition</h2></div>
              <PieChart size={16} className="dashboard-muted-icon" />
            </div>
            <div className="exposure-meter">
              <div className="exposure-meter__track">
                <span style={{ width: Math.min(100, (Number(summary.data?.heldBalance ?? 0) / Math.max(1, Number(summary.data?.totalBalance ?? 1))) * 100) + '%' }} />
              </div>
              <div><strong>{formatMoney(summary.data?.heldBalance, summary.data?.currency)}</strong><small>currently held in open positions</small></div>
            </div>
            <div className="return-summary">
              <div><span>Available</span><strong>{formatMoney(summary.data?.availableBalance, summary.data?.currency)}</strong></div>
              <div><span>Held</span><strong>{formatMoney(summary.data?.heldBalance, summary.data?.currency)}</strong></div>
              <div><span>Average trade</span><strong>{formatMoney(analytics.data?.averageTrade, analytics.data?.currency)}</strong></div>
              <div><span>Win rate</span><strong>{analytics.data?.winRate ?? '0'}%</strong></div>
              <div><span>Loss rate</span><strong>{analytics.data?.lossRate ?? '0'}%</strong></div>
            </div>
          </section>
        </div>
      </ApiState>
    </div>
  )
}

function PortfolioPage() {
  const summary = usePortfolioSummary()
  const analytics = usePortfolioAnalytics()
  const [page, setPage] = useState(1)
  const positions = usePortfolioPositions(page, 10)

  const exportAnalytics = useCallback(() => {
    if (!analytics.data) return
    const rows = [
      ['Date', 'Daily P&L', 'Cumulative P&L', 'Trades'],
      ...analytics.data.series.map((point) => [point.date, point.pnl, point.cumulativePnl, String(point.tradeCount)]),
    ]
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'slspot-performance-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [analytics.data])

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Analytics" title="Performance" description="Daily, weekly and monthly server-calculated performance across the selected wallet." />
      <ApiState
        loading={summary.loading || analytics.loading || positions.loading}
        error={summary.error ?? analytics.error ?? positions.error}
        onRetry={() => { void summary.reload(); void analytics.reload(); void positions.reload() }}
      >
        <div className="dashboard-stats dashboard-stats--six">
          <StatCard label="Daily P&amp;L" value={signedMoney(analytics.data?.dailyPnl)} change="Today" positive={Number(analytics.data?.dailyPnl ?? 0) >= 0} icon={TrendingUp} />
          <StatCard label="Weekly P&amp;L" value={signedMoney(analytics.data?.weeklyPnl)} change="This week" positive={Number(analytics.data?.weeklyPnl ?? 0) >= 0} icon={BarChart3} />
          <StatCard label="Monthly P&amp;L" value={signedMoney(analytics.data?.monthlyPnl)} change="This month" positive={Number(analytics.data?.monthlyPnl ?? 0) >= 0} icon={PieChart} />
          <StatCard label="Win rate" value={(analytics.data?.winRate ?? '0') + '%'} change={(analytics.data?.wins ?? 0) + ' wins · ' + (analytics.data?.losses ?? 0) + ' losses'} positive icon={Check} />
          <StatCard label="Average trade" value={formatMoney(analytics.data?.averageTrade, analytics.data?.currency)} change="30-day average" positive icon={DollarSign} />
          <StatCard label="Volume" value={formatMoney(analytics.data?.volume, analytics.data?.currency)} change={(analytics.data?.tradeCount ?? 0) + ' settled trades'} positive icon={ArrowUpCircle} />
        </div>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Performance</span><h2>30-day trend</h2></div>
            <button type="button" className="setting-button" onClick={exportAnalytics}><Download size={14} /> Export</button>
          </div>
          <Sparkline series={analytics.data?.series ?? []} currency={analytics.data?.currency ?? 'USD'} />
        </section>

        <div className="portfolio-layout">
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Assets</span><h2>Asset performance</h2></div>
              <span className="status-pill status-pill--pending">{analytics.data?.assets.length ?? 0} ASSETS</span>
            </div>
            <div className="asset-performance-list">
              {(analytics.data?.assets ?? []).map((asset) => (
                <div className="asset-performance-row" key={asset.assetId}>
                  <div><strong>{asset.symbol}</strong><small>{asset.name}</small></div>
                  <span>{asset.trades} trades</span>
                  <span>{formatMoney(asset.volume, analytics.data?.currency)}</span>
                  <strong className={Number(asset.pnl) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(asset.pnl)}</strong>
                </div>
              ))}
              {analytics.data?.assets.length === 0 ? <div className="dashboard-note">No settled asset performance is available yet.</div> : null}
            </div>
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Positions</span><h2>Position history</h2></div>
              <span className="status-pill status-pill--pending">{positions.data?.pagination.total ?? 0} RECORDS</span>
            </div>
            <div className="holdings-list">
              {(positions.data?.items ?? []).map((position) => (
                <div className="holding" key={position.id}>
                  <span className="holding__icon">{position.asset.symbol.slice(0, 1)}</span>
                  <div className="holding__identity"><strong>{position.asset.symbol}</strong><small>{position.direction} · {position.status}</small></div>
                  <div className="holding__allocation"><span><b>{formatMoney(position.amount, summary.data?.currency)}</b><small>Entry {formatPrice(Number(position.entryPrice))}</small></span></div>
                  <span>{position.closedAt ? formatDateTime(position.closedAt) : 'Open'}</span>
                </div>
              ))}
              {positions.data?.items.length === 0 ? <div className="dashboard-note">No positions have been recorded yet.</div> : null}
            </div>
            {positions.data ? <Pagination page={page} totalPages={positions.data.pagination.totalPages} onChange={setPage} /> : null}
          </section>
        </div>
      </ApiState>
    </div>
  )
}

function WalletPage() {
  const wallet = useWallet()
  const wallets = useWallets()
  const { mode, setMode } = useWalletMode()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<WalletTransactionFilters>({ search: '', type: undefined, status: undefined, from: '', to: '' })
  const transactions = useWalletTransactions(page, 10, filters)
  const [fundingAction, setFundingAction] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [fundingError, setFundingError] = useState('')
  const [fundingMessage, setFundingMessage] = useState('')
  const [fundingSubmitting, setFundingSubmitting] = useState(false)
  const isDemo = mode === 'DEMO'

  const updateFilters = (patch: Partial<WalletTransactionFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  const submitFunding = async () => {
    if (!isDemo) {
      setFundingError('Real-money funding is not enabled yet.')
      return
    }
    setFundingError('')
    setFundingMessage('')
    setFundingSubmitting(true)
    try {
      const clientRequestId = crypto.randomUUID()
      if (fundingAction === 'deposit') {
        const result = await walletApi.deposit({ amount: amount.trim(), clientRequestId }, mode)
        setFundingMessage(result.status === 'COMPLETED' ? 'Demo deposit completed successfully.' : 'Deposit is processing.')
      } else {
        const result = await walletApi.withdraw({ amount: amount.trim(), destination: destination.trim(), clientRequestId }, mode)
        setFundingMessage(result.status === 'COMPLETED' ? 'Demo withdrawal completed successfully.' : 'Withdrawal is processing.')
      }
      setAmount('')
      setDestination('')
      setPage(1)
      await Promise.all([wallet.reload(), wallets.reload(), transactions.reload()])
    } catch (error) {
      setFundingError(error instanceof Error ? error.message : 'Funding request failed.')
    } finally {
      setFundingSubmitting(false)
    }
  }

  const exportTransactions = useCallback(async () => {
    try {
      const base = { ...filters, page: 1, pageSize: 100 }
      const first = await walletApi.transactions(base, mode)
      const rows = [...first.items]
      for (let current = 2; current <= first.pagination.totalPages; current += 1) {
        const next = await walletApi.transactions({ ...base, page: current }, mode)
        rows.push(...next.items)
      }
      if (!rows.length) return
      const csv = '\uFEFF' + [
        ['Transaction ID', 'Type', 'Status', 'Amount', 'Currency', 'Reference', 'Description', 'Created At'],
        ...rows.map((item) => [item.id, item.type, item.status, item.amount, item.currency, item.referenceType ?? '', item.description ?? '', item.createdAt]),
      ].map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'slspot-wallet-' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setFundingError(error instanceof Error ? error.message : 'Unable to export wallet activity.')
    }
  }, [filters, mode])

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Funds" title="Wallet" description={isDemo ? 'Demo funding workflows are server-authoritative and fully recorded in the ledger.' : 'Real wallet operations stay disabled until a payment provider and compliance flow are connected.'} action="Back to trading" />

      <ApiState
        loading={wallet.loading || wallets.loading}
        error={wallet.error ?? wallets.error}
        onRetry={() => { void wallet.reload(); void wallets.reload(); void transactions.reload() }}
      >
        <div className="dashboard-stats dashboard-stats--four">
          <StatCard label="Available" value={formatMoney(wallet.data?.availableBalance, wallet.data?.currency)} change={isDemo ? 'Demo wallet' : 'Real wallet'} positive icon={WalletCards} />
          <StatCard label="Held" value={formatMoney(wallet.data?.heldBalance, wallet.data?.currency)} change="Reserved" positive icon={DollarSign} />
          <StatCard label="Total" value={formatMoney(wallet.data?.totalBalance, wallet.data?.currency)} change="Available + held" positive icon={TrendingUp} />
          <StatCard label="Transactions" value={String(transactions.data?.pagination.total ?? 0)} change={formatMoney(wallet.data?.pendingFunds, wallet.data?.currency) + ' pending'} positive icon={Clock3} />
        </div>

        <div className="wallet-grid">
          <section className="dashboard-card panel wallet-funding-card">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Funding</span><h2>{fundingAction === 'deposit' ? 'Deposit' : 'Withdraw'}</h2></div>
              <span className={isDemo ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>{isDemo ? 'DEMO' : 'LOCKED'}</span>
            </div>
            <div className="wallet-funding-tabs">
              <button type="button" className={fundingAction === 'deposit' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => setFundingAction('deposit')}><ArrowDownCircle size={14} /> Deposit</button>
              <button type="button" className={fundingAction === 'withdrawal' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => setFundingAction('withdrawal')}><ArrowUpCircle size={14} /> Withdraw</button>
            </div>

            {fundingAction === 'deposit' ? (
              <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100.00" disabled={!isDemo || fundingSubmitting} /></div><small>Demo deposits are credited immediately, capped at $1,000,000, and create a balanced ledger transaction.</small></label>
            ) : (
              <>
                <label className="wallet-funding-field"><span>Destination</span><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Demo destination" disabled={!isDemo || fundingSubmitting} /></label>
                <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="50.00" disabled={!isDemo || fundingSubmitting} /></div><small>Withdrawals use available demo balance, have a $0 demo fee, and are fully ledger-recorded. Maximum $1,000,000.</small></label>
              </>
            )}

            <button type="button" className="btn btn--primary" onClick={() => void submitFunding()} disabled={!isDemo || fundingSubmitting || !amount.trim() || (fundingAction === 'withdrawal' && !destination.trim())}>
              {fundingSubmitting ? 'Processing…' : fundingAction === 'deposit' ? 'Submit deposit' : 'Submit withdrawal'}
            </button>
            {fundingError ? <div className="wallet-form-note" role="alert">{fundingError}</div> : null}
            {fundingMessage ? <div className="wallet-form-note wallet-form-note--success" role="status"><Check size={14} /> {fundingMessage}</div> : null}
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Wallet mode</span><h2>Balances</h2></div>
              <ShieldCheck size={16} className="dashboard-muted-icon" />
            </div>
            <div className="wallet-balance-switcher">
              {(['DEMO', 'REAL'] as const).map((walletMode) => {
                const item = wallets.data?.find((entry) => entry.mode === walletMode)
                const active = walletMode === mode
                return (
                  <button key={walletMode} type="button" className={active ? 'wallet-balance-option wallet-balance-option--active' : 'wallet-balance-option'} onClick={() => { setMode(walletMode); setPage(1); setFundingError(''); setFundingMessage('') }}>
                    <span>{walletMode === 'DEMO' ? 'Demo' : 'Real'}</span>
                    <strong>{formatMoney(item?.availableBalance, item?.currency)}</strong>
                    <small>{walletMode === 'DEMO' ? 'Practice funds' : 'Live funds'}</small>
                  </button>
                )
              })}
            </div>
            <div className="wallet-form-note"><ShieldCheck size={14} /> {isDemo ? 'Demo funding is simulated for testing but follows the same wallet and ledger boundaries.' : 'Real funding is unavailable until payment-provider, KYC and withdrawal controls are implemented.'}</div>
          </section>
        </div>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Transactions</span><h2>Wallet activity</h2></div>
            <div className="dashboard-card__actions"><button type="button" className="setting-button" onClick={() => void exportTransactions()} disabled={transactions.loading}><Download size={14} /> Export</button></div>
          </div>
          <div className="wallet-transaction-toolbar">
            <label className="wallet-search"><Search size={14} /><input type="search" placeholder="Search transaction, reference or description" value={filters.search ?? ''} onChange={(event) => updateFilters({ search: event.target.value })} /></label>
            <label><span>Type</span><select value={filters.type ?? ''} onChange={(event) => updateFilters({ type: (event.target.value || undefined) as WalletTransactionFilters['type'] })}><option value="">All types</option><option value="DEPOSIT">Deposit</option><option value="WITHDRAWAL">Withdrawal</option><option value="TRADE_HOLD">Trade hold</option><option value="SETTLEMENT">Settlement</option><option value="FEE">Fee</option><option value="ADJUSTMENT">Adjustment</option></select></label>
            <label><span>Status</span><select value={filters.status ?? ''} onChange={(event) => updateFilters({ status: (event.target.value || undefined) as WalletTransactionFilters['status'] })}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="REJECTED">Rejected</option></select></label>
            <label><span><CalendarDays size={12} /> From</span><input type="date" value={filters.from ?? ''} max={filters.to || undefined} onChange={(event) => updateFilters({ from: event.target.value })} /></label>
            <label><span><CalendarDays size={12} /> To</span><input type="date" value={filters.to ?? ''} min={filters.from || undefined} onChange={(event) => updateFilters({ to: event.target.value })} /></label>
          </div>
          <ApiState loading={transactions.loading} error={transactions.error} onRetry={() => void transactions.reload()}>
            <div className="data-table">
              <div className="data-table__row data-table__row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>
              {(transactions.data?.items ?? []).map((item) => (
                <div className="data-table__row" key={item.id}>
                  <div><strong>{item.description ?? item.type}</strong><small>{item.referenceType ?? 'Wallet transaction'} · #{item.id}</small></div>
                  <span>{item.type}</span>
                  <strong className={Number(item.amount) >= 0 ? 'text-positive' : 'text-negative'}>{formatMoney(item.amount, item.currency)}</strong>
                  <span className={item.status === 'COMPLETED' ? 'status-pill status-pill--positive' : item.status === 'FAILED' || item.status === 'REJECTED' ? 'status-pill status-pill--negative' : 'status-pill status-pill--pending'}>{item.status}</span>
                  <small>{formatDateTime(item.createdAt)}</small>
                </div>
              ))}
            </div>
            {transactions.data?.items.length === 0 ? <div className="dashboard-note">No wallet transactions match the current filters.</div> : null}
            {transactions.data ? <Pagination page={page} totalPages={transactions.data.pagination.totalPages} onChange={setPage} /> : null}
          </ApiState>
        </section>
      </ApiState>
    </div>
  )
}

function HistoryPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'>('')
  const [search, setSearch] = useState('')
  const [assetId, setAssetId] = useState('')
  const [direction, setDirection] = useState<'' | 'UP' | 'DOWN'>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortBy, setSortBy] = useState<'openedAt' | 'closedAt' | 'amount' | 'netPnl'>('openedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const assets = useMarketAssets(100)

  const trades = useTrades(page, 25, status || undefined, {
    search: search.trim() || undefined,
    assetId: assetId || undefined,
    direction: direction || undefined,
    from: from || undefined,
    to: to || undefined,
    sortBy,
    sortOrder,
  })

  const resetPage = () => setPage(1)

  const resetFilters = () => {
    setSearch('')
    setAssetId('')
    setDirection('')
    setStatus('')
    setFrom('')
    setTo('')
    setSortBy('openedAt')
    setSortOrder('desc')
    resetPage()
  }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const filters = {
        search: search.trim() || undefined,
        assetId: assetId || undefined,
        direction: direction || undefined,
        from: from || undefined,
        to: to || undefined,
        sortBy,
        sortOrder,
      }
      const rows: Array<NonNullable<typeof trades.data>['items'][number]> = []
      let exportPage = 1
      for (;;) {
        const result = await tradesApi.list({ page: exportPage, pageSize: 100, status: status || undefined, ...filters })
        rows.push(...result.items)
        if (exportPage >= result.pagination.totalPages) break
        exportPage += 1
      }
      const escapeCsv = (value: unknown) => {
        const text = String(value ?? '')
        return '"' + text.replaceAll('"', '""') + '"'
      }
      const lines = [
        ['Trade ID', 'Asset', 'Direction', 'Entry', 'Exit', 'Amount', 'Result', 'Net P&L', 'Fee', 'Opened', 'Closed', 'Settlement reference'].map(escapeCsv).join(','),
        ...rows.map((trade) => [
          trade.id,
          trade.position.asset.symbol,
          trade.position.side === 'BUY' ? 'UP' : 'DOWN',
          trade.position.entryPrice,
          trade.position.exitPrice,
          trade.position.amount,
          trade.status,
          trade.netPnl,
          trade.fee,
          trade.openedAt,
          trade.closedAt,
          trade.settlementReference,
        ].map(escapeCsv).join(',')),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'slspot-trade-history.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to export trade history')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Records" title="Trade history" description="Review server-recorded trades, outcomes and P&amp;L." />

      <section className="trade-history-toolbar panel">
        <div className="trade-history-toolbar__top">
          <label className="trade-history-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPage() }}
              placeholder="Search trade, asset or ID"
              aria-label="Search trade history"
            />
          </label>
          <button type="button" className="quiet-button trade-history-reset" onClick={resetFilters}>
            Reset filters
          </button>
          <button type="button" className="quiet-button trade-history-export" disabled={exporting} onClick={() => void exportCsv()}>
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        <div className="trade-history-toolbar__filters">
          <ThemedSelect
            label="Status"
            value={status}
            options={[
              { value: '', label: 'All' },
              { value: 'OPEN', label: 'Open' },
              { value: 'WON', label: 'Won' },
              { value: 'LOST', label: 'Lost' },
              { value: 'CANCELLED', label: 'Cancelled' },
              { value: 'EXPIRED', label: 'Expired' },
            ]}
            onChange={(value) => { setStatus(value as typeof status); resetPage() }}
          />

          <ThemedSelect
            label="Asset"
            value={assetId}
            options={[
              { value: '', label: 'All assets' },
              ...(assets.data?.items ?? []).map((asset) => ({ value: asset.assetId, label: asset.symbol })),
            ]}
            onChange={(value) => { setAssetId(value); resetPage() }}
          />

          <ThemedSelect
            label="Direction"
            value={direction}
            options={[
              { value: '', label: 'Both' },
              { value: 'UP', label: 'UP' },
              { value: 'DOWN', label: 'DOWN' },
            ]}
            onChange={(value) => { setDirection(value as typeof direction); resetPage() }}
          />

          <label className="trade-history-control trade-history-date">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); resetPage() }} />
          </label>

          <label className="trade-history-control trade-history-date">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); resetPage() }} />
          </label>

          <ThemedSelect
            label="Sort"
            value={sortBy + ':' + sortOrder}
            options={[
              { value: 'openedAt:desc', label: 'Newest opened' },
              { value: 'openedAt:asc', label: 'Oldest opened' },
              { value: 'closedAt:desc', label: 'Newest closed' },
              { value: 'amount:desc', label: 'Largest amount' },
              { value: 'netPnl:desc', label: 'Highest P&L' },
              { value: 'netPnl:asc', label: 'Lowest P&L' },
            ]}
            onChange={(value) => {
              const [nextSort, nextOrder] = value.split(':')
              setSortBy(nextSort as typeof sortBy)
              setSortOrder(nextOrder as typeof sortOrder)
              resetPage()
            }}
          />
        </div>

        {assets.loading ? <div className="trade-history-progress"><span className="muted-dot" /> Loading asset filters…</div> : null}
        {exportError ? <div className="trade-history-error" role="alert"><strong>Export failed.</strong> {exportError}</div> : null}
      </section>

      <section className="dashboard-card panel trade-history-card">
        <div className="dashboard-card__header trade-history-card__header">
          <div>
            <span className="eyebrow">Results</span>
            <h2>Recorded trades</h2>
          </div>
          <span className="status-pill status-pill--pending">
            {trades.data?.pagination.total ?? 0} RECORDS
          </span>
        </div>

        <ApiState loading={trades.loading} error={trades.error} onRetry={() => void trades.reload()}>
          <div className="data-table trade-history-table">
            <div className="data-table__row data-table__row--header">
              <span>Trade</span>
              <span>Side</span>
              <span>Amount</span>
              <span>Result</span>
              <span>P&amp;L</span>
            </div>

            {(trades.data?.items ?? []).map((trade) => (
              <div className="data-table__row trade-history-table__row" key={trade.id}>
                <div>
                  <strong>{trade.position.asset.symbol}</strong>
                  <small>{trade.id} · {formatDateTime(trade.openedAt)}</small>
                </div>
                <span className={trade.position.side === 'BUY' ? 'side-label side-label--up' : 'side-label side-label--down'}>
                  {trade.position.side === 'BUY' ? 'UP' : 'DOWN'}
                </span>
                <span>{formatMoney(trade.position.amount)}</span>
                <span className={trade.status === 'WON' ? 'status-pill status-pill--positive' : trade.status === 'LOST' ? 'status-pill status-pill--negative' : 'status-pill status-pill--pending'}>
                  {trade.status}
                </span>
                <strong className={Number(trade.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>
                  {signedMoney(trade.netPnl)}
                </strong>
              </div>
            ))}

            {trades.data?.items.length === 0 ? <div className="dashboard-note trade-history-empty">No trades match the selected filters.</div> : null}
          </div>

          {trades.data ? (
            <div className="trade-history-footer">
              <span>{trades.data.pagination.total} total record{trades.data.pagination.total === 1 ? '' : 's'}</span>
              <Pagination page={page} totalPages={trades.data.pagination.totalPages} onChange={setPage} />
            </div>
          ) : null}
        </ApiState>
      </section>
    </div>
  )
}
function NotificationsPage() {
  const { user } = useAuth()
  const realtime = useRealtime()
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const notifications = useNotifications(page, 15, unreadOnly)
  const unread = useNotifications(1, 1, true)
  const unreadCount = unread.data?.pagination.total ?? 0
  const reloadNotifications = notifications.reload
  const reloadUnread = unread.reload
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    return realtime.subscribe(userChannel(user.id))
  }, [realtime, user?.id])

  useEffect(() => {
    return realtime.onEvent((event) => {
      if (event.type !== 'notification.created') return
      const data = event.data as { title?: unknown; body?: unknown }
      setToast({
        title: typeof data.title === 'string' ? data.title : 'New notification',
        message: typeof data.body === 'string' ? data.body : 'You have a new account notification.',
      })
      window.setTimeout(() => setToast(null), 4500)
      void reloadNotifications()
      void reloadUnread()
    })
  }, [reloadNotifications, reloadUnread, realtime])

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id)
    await Promise.all([notifications.reload(), unread.reload()])
  }

  const markAllRead = async () => {
    if (!unreadCount) return
    await notificationsApi.markAllRead()
    await Promise.all([notifications.reload(), unread.reload()])
  }

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Activity" title="Notifications" description="Trade, wallet, security and system events delivered from the server." />
      <ApiState loading={notifications.loading || unread.loading} error={notifications.error ?? unread.error} onRetry={() => { void notifications.reload(); void unread.reload() }}>
        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Inbox</span><h2>{unreadCount} unread notification{unreadCount === 1 ? '' : 's'}</h2></div>
            <div className="notification-actions">
              <button type="button" className={unreadOnly ? 'filter-chip filter-chip--active' : 'filter-chip'} onClick={() => { setUnreadOnly((value) => !value); setPage(1) }}>{unreadOnly ? 'Unread only' : 'All notifications'}</button>
              <button type="button" className="setting-button" onClick={() => void markAllRead()} disabled={!unreadCount}><Check size={14} /> Mark all read</button>
            </div>
          </div>
          <div className="notification-list">
            {(notifications.data?.items ?? []).map((item) => {
              const Icon = iconForNotification[item.type]
              const unreadItem = !item.readAt
              return (
                <article className={unreadItem ? 'notification-item notification-item--unread' : 'notification-item'} key={item.id}>
                  <span className="notification-item__icon"><Icon size={14} /></span>
                  <div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDateTime(item.createdAt)}</small></div>
                  {unreadItem ? <button type="button" className="notification-read-button" onClick={() => void markRead(item.id)}>Mark read</button> : <span className="notification-read-label">Read</span>}
                </article>
              )
            })}
          </div>
          {notifications.data?.items.length === 0 ? <div className="dashboard-note">No notifications match this view.</div> : null}
          {notifications.data ? <Pagination page={page} totalPages={notifications.data.pagination.totalPages} onChange={setPage} /> : null}
        </section>
      </ApiState>
      {toast ? (
        <div className="toast-viewport" aria-live="polite">
          <Toast title={toast.title} message={toast.message} />
        </div>
      ) : null}
    </div>
  )
}

function SecurityPage() {
  const sessions = useAuthSessions()
  const devices = useAuthDevices()
  const loginHistory = useLoginHistory()
  const securityEvents = useSecurityEvents()
  const twoFactor = useTwoFactorStatus()
  const { user, logoutAll } = useAuth()
  const [actionError, setActionError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showRecoveryCodes, setShowRecoveryCodes] = useState<string[] | null>(null)
  const [showTwoFactorForm, setShowTwoFactorForm] = useState(false)

  const reloadSecurity = async () => {
    await Promise.all([
      sessions.reload(),
      devices.reload(),
      loginHistory.reload(),
      securityEvents.reload(),
      twoFactor.reload(),
    ])
  }

  const revoke = async (sessionId: string) => {
    setActionError(null)
    try {
      await authApi.revokeSession(sessionId)
      await sessions.reload()
      await devices.reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to revoke session')
    }
  }

  const startTwoFactorSetup = async () => {
    setActionError(null)
    try {
      const result = await authApi.setupTwoFactor()
      setSetup(result)
      setTwoFactorCode('')
      setShowTwoFactorForm(true)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to start two-factor setup')
    }
  }

  const enableTwoFactor = async () => {
    setActionError(null)
    try {
      const result = await authApi.enableTwoFactor(twoFactorCode)
      setShowRecoveryCodes(result.recoveryCodes)
      setShowTwoFactorForm(false)
      setSetup(null)
      setTwoFactorCode('')
      await reloadSecurity()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to enable two-factor authentication')
    }
  }

  const disableTwoFactor = async () => {
    setActionError(null)
    const code = window.prompt('Enter your current authenticator code to disable two-factor authentication.')
    if (!code) return
    try {
      await authApi.disableTwoFactor(code)
      await reloadSecurity()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to disable two-factor authentication')
    }
  }

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Account protection" title="Security" description="Manage sessions, devices, two-factor authentication and security history." action="Account overview" />

      <div className="security-banner panel">
        <span className="security-banner__icon"><ShieldCheck size={17} /></span>
        <div><strong>{user?.email ?? 'Authenticated account'}</strong><p>Security controls are server-backed.</p></div>
        <span className="status-pill status-pill--positive">{user?.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}</span>
      </div>

      <div className="settings-grid">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Sign-in</span><h2>Authentication</h2></div></div>
          <div className="setting-row">
            <div><strong>Two-factor authentication</strong><small>{twoFactor.data?.enabled ? 'Authenticator verification is required after your password.' : 'Protect sign-in with a TOTP authenticator app.'}</small></div>
            {twoFactor.data?.enabled
              ? <button type="button" className="setting-button setting-button--danger" onClick={() => void disableTwoFactor()}>Disable</button>
              : <button type="button" className="setting-button" onClick={() => void startTwoFactorSetup()}>{showTwoFactorForm ? 'Setup open' : 'Enable'}</button>}
          </div>
          <div className="setting-row"><div><strong>Recovery codes</strong><small>{twoFactor.data?.enabled ? (twoFactor.data.recoveryCodesRemaining + ' unused recovery codes remain.') : 'Recovery codes are generated when 2FA is enabled.'}</small></div><span className="status-pill status-pill--pending">{twoFactor.data?.recoveryCodesRemaining ?? 0}</span></div>
          <div className="setting-row"><div><strong>Session cookie</strong><small>Authenticated session is stored in an HttpOnly cookie.</small></div><span className="status-pill status-pill--positive">ACTIVE</span></div>
          <div className="setting-row"><div><strong>Sign out all sessions</strong><small>Invalidates every active browser session and tracked device.</small></div><button type="button" className="setting-button setting-button--danger" onClick={() => void logoutAll()}>Sign out all</button></div>

          {showTwoFactorForm && setup ? (
            <div className="two-factor-setup">
              <div className="two-factor-setup__secret"><span>Authenticator secret</span><code>{setup.secret}</code></div>
              <div className="dashboard-note">Add this secret to your authenticator app, then enter the six-digit code below. Provisioning URI: <code>{setup.otpauthUri}</code></div>
              <label><span>Verification code</span><input inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" /></label>
              <div className="security-actions"><button type="button" className="setting-button" disabled={twoFactorCode.length !== 6} onClick={() => void enableTwoFactor()}>Enable 2FA</button><button type="button" className="quiet-button" onClick={() => { setShowTwoFactorForm(false); setSetup(null) }}>Cancel</button></div>
            </div>
          ) : null}

          {showRecoveryCodes ? (
            <div className="two-factor-recovery" role="status">
              <div className="dashboard-card__header"><div><span className="eyebrow">Save these now</span><h3>Recovery codes</h3></div></div>
              <p>Each code can be used once when the authenticator is unavailable.</p>
              <div className="recovery-code-grid">{showRecoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
              <button type="button" className="quiet-button" onClick={() => setShowRecoveryCodes(null)}>I saved them</button>
            </div>
          ) : null}

          {actionError ? <div className="dashboard-note dashboard-note--error" role="alert">{actionError}</div> : null}
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Sessions</span><h2>Active sessions</h2></div><span className="status-pill status-pill--pending">{sessions.data?.sessions.length ?? 0}</span></div>
          <ApiState loading={sessions.loading} error={sessions.error} onRetry={() => void sessions.reload()}>
            {(sessions.data?.sessions ?? []).map((session) => (
              <div className="session-item" key={session.id}>
                <span className="session-item__icon"><Smartphone size={15} /></span>
                <div><strong>{session.userAgent ? session.userAgent.slice(0, 44) : 'Browser session'}</strong><small>{session.current ? 'Current session' : 'Active session'} · Last seen {formatDateTime(session.lastSeenAt)}</small></div>
                {session.current ? <span className="status-pill status-pill--positive">CURRENT</span> : <button type="button" className="setting-button setting-button--danger" onClick={() => void revoke(session.id)}>Revoke</button>}
              </div>
            ))}
          </ApiState>
        </section>
      </div>

      <div className="settings-grid">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Devices</span><h2>Tracked devices</h2></div><span className="status-pill status-pill--pending">{devices.data?.devices.length ?? 0}</span></div>
          <ApiState loading={devices.loading} error={devices.error} onRetry={() => void devices.reload()}>
            {(devices.data?.devices ?? []).map((device) => (
              <div className="session-item" key={device.id}>
                <span className="session-item__icon"><Smartphone size={15} /></span>
                <div><strong>{device.deviceName ?? 'Browser session'}</strong><small>{device.userAgent?.slice(0, 55) ?? 'Unknown user agent'} · Last seen {formatDateTime(device.lastSeenAt)}</small></div>
              </div>
            ))}
          </ApiState>
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Login history</span><h2>Recent sign-ins</h2></div></div>
          <ApiState loading={loginHistory.loading} error={loginHistory.error} onRetry={() => void loginHistory.reload()}>
            {(loginHistory.data?.items ?? []).map((event) => (
              <div className="security-event-row" key={event.id}><span className={event.action === 'LOGIN_SUCCESS' ? 'status-pill status-pill--positive' : 'status-pill status-pill--danger'}>{event.action.replaceAll('_', ' ')}</span><div><strong>{event.ipAddress ?? 'Unknown IP'}</strong><small>{event.userAgent?.slice(0, 42) ?? 'Unknown device'} · {formatDateTime(event.createdAt)}</small></div></div>
            ))}
          </ApiState>
        </section>
      </div>

      <section className="dashboard-card panel">
        <div className="dashboard-card__header"><div><span className="eyebrow">Security events</span><h2>Account activity</h2></div></div>
        <ApiState loading={securityEvents.loading} error={securityEvents.error} onRetry={() => void securityEvents.reload()}>
          <div className="security-event-list">
            {(securityEvents.data?.items ?? []).map((event) => (
              <div className="security-event-row" key={event.id}><span className="status-pill status-pill--pending">{event.action.replaceAll('_', ' ')}</span><div><strong>{event.entityType}{event.entityId ? ' · ' + event.entityId.slice(0, 12) : ''}</strong><small>{event.ipAddress ?? 'No IP recorded'} · {formatDateTime(event.createdAt)}</small></div></div>
            ))}
          </div>
        </ApiState>
      </section>
    </div>
  )
}

function AccountPage() {
  const { user } = useAuth()

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Preferences" title="Account" description="Review your authenticated profile and workspace preferences." action="Back to trading" />
      <div className="account-layout">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Profile</span><h2>Personal details</h2></div></div>
          <div className="profile-card">
            <span className="profile-avatar">{avatarFor(user?.email)}</span>
            <div><strong>{user?.email ?? 'Account'}</strong><small>{user?.id ?? 'Authenticated user'}</small></div>
            <span className="status-pill status-pill--positive">{user?.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}</span>
          </div>
          <div className="form-grid">
            <label><span>Email</span><input value={user?.email ?? ''} readOnly type="email" /></label>
            <label><span>Country</span><input value={user?.countryCode ?? '—'} readOnly /></label>
          </div>
          <div className="dashboard-note">Profile mutation endpoints are intentionally deferred to the account-management phase.</div>
        </section>

        <aside className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Preferences</span><h2>Workspace</h2></div></div>
          {['Compact trading layout', 'Price movement alerts', 'Sound effects'].map((label, index) => (
            <div className="setting-row" key={label}>
              <div><strong>{label}</strong><small>{index === 2 ? 'Stored locally for now.' : 'UI preference.'}</small></div>
              <span className={index < 2 ? 'toggle toggle--on' : 'toggle'}><span /></span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

function SupportPage() {
  const faqs = [
    ['How do I place a trade?', 'The Trading Room now uses server-authoritative demo execution and settlement.'],
    ['Where can I see open positions?', 'Open positions are read from the authenticated portfolio API.'],
    ['Are the displayed balances real?', 'Dashboard and Wallet balances come from server state. Demo funds are simulated.'],
    ['When will real deposits be available?', 'Real-money funding remains gated until a payment provider, KYC controls and reconciliation flow are selected and connected.'],
  ]

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Help center" title="Support" description="Find answers about the current SL Spot workspace." />
      <div className="support-layout">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Common questions</span><h2>Getting started</h2></div></div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => <details key={question}><summary>{question}<ArrowUpRight size={13} /></summary><p>{answer}</p></details>)}
          </div>
        </section>
        <aside className="dashboard-card panel support-contact">
          <div className="dashboard-card__header"><div><span className="eyebrow">Need help?</span><h2>Contact support</h2></div></div>
          <p>Support messaging will be connected after the account and realtime services are available.</p>
          <button type="button" className="setting-button setting-button--primary" disabled>Coming soon</button>
          <div className="dashboard-note"><Clock3 size={14} /> Typical response target: under 1 business day.</div>
        </aside>
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
  return <div className="workspace-page"><PageHeader eyebrow={props.eyebrow} title={props.title} description={props.description} /></div>
}

function formatMoney(value: string | null | undefined, currency?: string | null): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '—'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(amount)
}

function signedMoney(value: string | null | undefined): string {
  const amount = Number(value ?? 0)
  return (amount >= 0 ? '+' : '-') + formatMoney(Math.abs(amount).toFixed(8))
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

function avatarFor(email: string | undefined): string {
  if (!email) return 'SL'
  const first = email[0]?.toUpperCase() ?? 'S'
  const second = email.includes('@') ? email[email.indexOf('@') + 1]?.toUpperCase() ?? 'L' : 'L'
  return first + second
}
