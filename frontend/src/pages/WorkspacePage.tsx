import { ArrowDownCircle, ArrowUpCircle, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, Clock3, Download, DollarSign, PieChart, Search, ShieldCheck, Smartphone, TrendingUp, WalletCards } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Pagination } from '../components/ui/Pagination'
import { ApiState } from '../components/ui/ApiState'
import { formatPrice } from '../lib/format'
import { notificationsApi } from '../api/notifications'
import { authApi } from '../api/auth'
import { walletApi, type WalletTransactionFilters } from '../api/wallet'
import { useAuth } from '../auth/AuthProvider'
import { useWalletMode } from '../hooks/useWalletMode'
import { useRealtime } from '../realtime/RealtimeProvider'
import { userChannel } from '../realtime/subscriptions'
import { useAuthSessions, useMarketAssets, useNotifications, usePortfolioAnalytics, usePortfolioPositions, usePortfolioSummary, useTrades, useWallet, useWalletTransactions, useWallets } from '../hooks/useServerState'

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
  const [filters, setFilters] = useState({ search: '', type: undefined, status: undefined, from: '', to: '' })
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
          <StatCard label="Transactions" value={String(transactions.data?.pagination.total ?? 0)} change="Filtered records" positive icon={Clock3} />
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
              <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100.00" disabled={!isDemo || fundingSubmitting} /></div><small>Demo deposits are credited immediately and create a balanced ledger transaction.</small></label>
            ) : (
              <>
                <label className="wallet-funding-field"><span>Destination</span><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Demo destination" disabled={!isDemo || fundingSubmitting} /></label>
                <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="50.00" disabled={!isDemo || fundingSubmitting} /></div><small>Withdrawals use available demo balance and are fully ledger-recorded.</small></label>
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
  const trades = useTrades(page, 10, status || undefined)

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Records" title="Trade history" description="Review server-recorded trades, outcomes and P&amp;L." />
      <div className="history-toolbar panel">
        <div className="history-filter">
          <span>Status</span>
          {(['', 'OPEN', 'WON', 'LOST', 'CANCELLED', 'EXPIRED'] as const).map((value) => (
            <button key={value || 'ALL'} type="button" className={status === value ? 'filter-chip filter-chip--active' : 'filter-chip'} onClick={() => { setStatus(value); setPage(1) }}>
              {value || 'All'}
            </button>
          ))}
        </div>
        <span className="status-pill status-pill--pending">SERVER RECORDS</span>
      </div>

      <ApiState loading={trades.loading} error={trades.error} onRetry={() => void trades.reload()}>
        <section className="dashboard-card panel">
          <div className="data-table">
            <div className="data-table__row data-table__row--header"><span>Trade</span><span>Side</span><span>Amount</span><span>Result</span><span>P&amp;L</span></div>
            {(trades.data?.items ?? []).map((trade) => (
              <div className="data-table__row" key={trade.id}>
                <div><strong>{trade.position.asset.symbol}</strong><small>{trade.id} · {formatDateTime(trade.openedAt)}</small></div>
                <span className={trade.position.side === 'BUY' ? 'side-label side-label--up' : 'side-label side-label--down'}>{trade.position.side}</span>
                <span>{formatMoney(trade.position.amount)}</span>
                <span className={trade.status === 'WON' ? 'status-pill status-pill--positive' : trade.status === 'LOST' ? 'status-pill status-pill--negative' : 'status-pill status-pill--pending'}>{trade.status}</span>
                <strong className={Number(trade.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(trade.netPnl)}</strong>
              </div>
            ))}
          </div>
          {trades.data?.items.length === 0 ? <div className="dashboard-note">No trades match the selected filter.</div> : null}
          {trades.data ? <Pagination page={page} totalPages={trades.data.pagination.totalPages} onChange={setPage} /> : null}
        </section>
      </ApiState>
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

  useEffect(() => {
    if (!user?.id) return
    return realtime.subscribe(userChannel(user.id))
  }, [realtime, user?.id])

  useEffect(() => {
    return realtime.onEvent((event) => {
      if (event.type !== 'notification.created') return
      void notifications.reload()
      void unread.reload()
    })
  }, [notifications.reload, realtime, unread.reload])

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
    </div>
  )
}

function SecurityPage() {
  const sessions = useAuthSessions()
  const { user, logoutAll } = useAuth()
  const [actionError, setActionError] = useState<string | null>(null)

  const revoke = async (sessionId: string) => {
    setActionError(null)
    try {
      await authApi.revokeSession(sessionId)
      await sessions.reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to revoke session')
    }
  }

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Account protection" title="Security" description="Manage authenticated sessions and sign-in protection." action="Account overview" />

      <div className="security-banner panel">
        <span className="security-banner__icon"><ShieldCheck size={17} /></span>
        <div><strong>{user?.email ?? 'Authenticated account'}</strong><p>Server-backed session management is active.</p></div>
        <span className="status-pill status-pill--positive">{user?.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}</span>
      </div>

      <div className="settings-grid">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Sign-in</span><h2>Authentication</h2></div></div>
          <div className="setting-row"><div><strong>Two-factor authentication</strong><small>MFA endpoints are planned for the security hardening phase.</small></div><button type="button" className="setting-button" disabled>Coming soon</button></div>
          <div className="setting-row"><div><strong>Session cookie</strong><small>HttpOnly server session; no auth token is stored in localStorage.</small></div><span className="status-pill status-pill--positive">ACTIVE</span></div>
          <div className="setting-row"><div><strong>Sign out all sessions</strong><small>Invalidates every active session, including this browser.</small></div><button type="button" className="setting-button setting-button--danger" onClick={() => void logoutAll()}>Sign out all</button></div>
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Sessions</span><h2>Active devices</h2></div><span className="status-pill status-pill--pending">{sessions.data?.sessions.length ?? 0}</span></div>
          <ApiState loading={sessions.loading} error={sessions.error} onRetry={() => void sessions.reload()}>
            {(sessions.data?.sessions ?? []).map((session) => (
              <div className="session-item" key={session.id}>
                <span className="session-item__icon"><Smartphone size={15} /></span>
                <div><strong>{session.userAgent ? session.userAgent.slice(0, 44) : 'Browser session'}</strong><small>{session.current ? 'Current session' : 'Active session'} · Last seen {formatDateTime(session.lastSeenAt)}</small></div>
                {session.current
                  ? <span className="status-pill status-pill--positive">CURRENT</span>
                  : <button type="button" className="setting-button setting-button--danger" onClick={() => void revoke(session.id)}>Revoke</button>}
              </div>
            ))}
          </ApiState>
          {actionError ? <div className="dashboard-note" role="alert">{actionError}</div> : null}
        </section>
      </div>
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
    ['How do I place a trade?', 'The Trading Room currently runs demo execution locally; server-authoritative trading follows the market-data milestone.'],
    ['Where can I see open positions?', 'Open positions are now read from the authenticated portfolio API.'],
    ['Are the displayed balances real?', 'Dashboard and Wallet balances now come from server state.'],
    ['When will deposits be available?', 'Funding mutations are deferred until the ledger and payment services are implemented.'],
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
