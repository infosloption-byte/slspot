import { ArrowDownCircle, ArrowUpCircle, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, Clock3, Download, DollarSign, PieChart, Search, Star, ShieldCheck, Smartphone, TrendingUp, WalletCards } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Select'
import { ApiState } from '../components/ui/ApiState'
import { Toast } from '../components/ui/Toast'
import { formatPrice } from '../lib/format'
import { notificationsApi } from '../api/notifications'
import { authApi } from '../api/auth'
import { tradesApi } from '../api/trades'
import { walletApi, type WalletTransactionFilters } from '../api/wallet'
import { supportApi, type SupportCategory } from '../api/support'
import { useAuth } from '../auth/useAuth'
import { formatDateTime as formatLocalDateTime } from '../lib/dateTime'
import { useWalletMode } from '../hooks/useWalletMode'
import { recordNotificationEvent, useNotificationStore, setUnreadCount, decrementUnreadCount } from '../state/notificationStore'
import { usePortfolioStore } from '../state/portfolioStore'
import { setCompactTradingLayout, setPriceMovementAlerts, setServerPreferences, usePreferences } from '../state/preferencesStore'
import { setSoundEnabled } from '../state/tradingUiStore'
import { useRealtime } from '../realtime/useRealtime'
import { userChannel } from '../realtime/subscriptions'
import { useAuthDevices, useAuthPreferences, useAuthSessions, useLoginHistory, useMarketAssets, useNotifications, usePortfolioAnalytics, usePortfolioPositions, usePortfolioSummary, useSecurityEvents, useSupportTicket, useSupportTickets, useTrades, useTradingCapabilities, useTwoFactorStatus, useWallet, useWalletTransactions, useWallets } from '../hooks/useServerState'

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
  return (
    <Select
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="trade-history-select-control"
    />
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
  const markets = useMarketAssets(25)
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem('slspot.watchlist.favorites')
      const parsed = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    const handleStorage = () => {
      try {
        const stored = window.localStorage.getItem('slspot.watchlist.favorites')
        const parsed = stored ? JSON.parse(stored) : []
        setFavoriteSymbols(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
      } catch {
        setFavoriteSymbols([])
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const favoriteMarkets = (markets.data?.items ?? []).filter((asset) => favoriteSymbols.includes(asset.symbol))

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
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Watchlist</span><h2>Favorite assets</h2></div>
              <Link to="/app/trading" className="dashboard-link">Manage <ArrowUpRight size={13} /></Link>
            </div>
            {favoriteMarkets.length ? (
              <div className="favorite-assets">
                {favoriteMarkets.slice(0, 6).map((asset) => (
                  <div className="favorite-asset" key={asset.assetId}>
                    <span className="favorite-asset__icon"><Star size={12} fill="currentColor" /></span>
                    <div>
                      <strong>{asset.symbol}</strong>
                      <small>{asset.name}</small>
                    </div>
                    <div className="favorite-asset__quote">
                      <strong>{asset.market?.lastPrice ? formatPrice(Number(asset.market.lastPrice), asset.priceScale > 4 ? 5 : 2) : '—'}</strong>
                      <small>{asset.market?.lastChangePct ?? '0'}%</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-note"><Star size={14} /> No favorite assets yet. Star a market from the Trading Room watchlist.</div>
            )}
          </section>
        </div>
      </ApiState>
    </div>
  )
}

function PortfolioPage() {
  const summary = usePortfolioSummary()
  const analytics = usePortfolioAnalytics()
  const portfolio = usePortfolioStore()
  const summaryData = summary.data ?? portfolio.summary
  const analyticsData = analytics.data ?? portfolio.analytics
  const [page, setPage] = useState(1)
  const positions = usePortfolioPositions(page, 10)

  const exportAnalytics = useCallback(() => {
    if (!analyticsData) return
    const rows = [
      ['Date', 'Daily P&L', 'Cumulative P&L', 'Trades'],
      ...analyticsData.series.map((point) => [point.date, point.pnl, point.cumulativePnl, String(point.tradeCount)]),
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
  }, [analyticsData])

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Analytics" title="Performance" description="Daily, weekly and monthly server-calculated performance across the selected wallet." />
      <ApiState
        loading={summary.loading || analytics.loading || positions.loading}
        error={summary.error ?? analytics.error ?? positions.error}
        onRetry={() => { void summary.reload(); void analytics.reload(); void positions.reload() }}
      >
        <div className="dashboard-stats dashboard-stats--six">
          <StatCard label="Daily P&amp;L" value={signedMoney(analyticsData?.dailyPnl)} change="Today" positive={Number(analyticsData?.dailyPnl ?? 0) >= 0} icon={TrendingUp} />
          <StatCard label="Weekly P&amp;L" value={signedMoney(analyticsData?.weeklyPnl)} change="This week" positive={Number(analyticsData?.weeklyPnl ?? 0) >= 0} icon={BarChart3} />
          <StatCard label="Monthly P&amp;L" value={signedMoney(analyticsData?.monthlyPnl)} change="This month" positive={Number(analyticsData?.monthlyPnl ?? 0) >= 0} icon={PieChart} />
          <StatCard label="Win rate" value={(analyticsData?.winRate ?? '0') + '%'} change={(analyticsData?.wins ?? 0) + ' wins · ' + (analyticsData?.losses ?? 0) + ' losses'} positive icon={Check} />
          <StatCard label="Average trade" value={formatMoney(analyticsData?.averageTrade, analyticsData?.currency)} change="30-day average" positive icon={DollarSign} />
          <StatCard label="Volume" value={formatMoney(analyticsData?.volume, analyticsData?.currency)} change={(analyticsData?.tradeCount ?? 0) + ' settled trades'} positive icon={ArrowUpCircle} />
        </div>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Performance</span><h2>30-day trend</h2></div>
            <button type="button" className="setting-button" onClick={exportAnalytics}><Download size={14} /> Export</button>
          </div>
          <Sparkline series={analyticsData?.series ?? []} currency={analyticsData?.currency ?? 'USD'} />
        </section>

        <div className="portfolio-layout">
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Assets</span><h2>Asset performance</h2></div>
              <span className="status-pill status-pill--pending">{analyticsData?.assets.length ?? 0} ASSETS</span>
            </div>
            <div className="asset-performance-list">
              {(analyticsData?.assets ?? []).map((asset) => (
                <div className="asset-performance-row" key={asset.assetId}>
                  <div><strong>{asset.symbol}</strong><small>{asset.name}</small></div>
                  <span>{asset.trades} trades</span>
                  <span>{formatMoney(asset.volume, analyticsData?.currency)}</span>
                  <strong className={Number(asset.pnl) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(asset.pnl)}</strong>
                </div>
              ))}
              {analyticsData?.assets.length === 0 ? <div className="dashboard-note">No settled asset performance is available yet.</div> : null}
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
                  <div className="holding__allocation"><span><b>{formatMoney(position.amount, summaryData?.currency)}</b><small>Entry {formatPrice(Number(position.entryPrice))}</small></span></div>
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
  const capabilities = useTradingCapabilities()
  const { mode, setMode } = useWalletMode()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<WalletTransactionFilters>({ search: '', type: undefined, status: undefined, from: '', to: '' })
  const transactions = useWalletTransactions(page, 10, filters)
  const [fundingAction, setFundingAction] = useState<'deposit' | 'withdrawal'>('deposit')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [fundingError, setFundingError] = useState('')
  const [fundingMessage, setFundingMessage] = useState('')
  const [fundingSubmitting, setFundingSubmitting] = useState(false)
  const isDemo = mode === 'DEMO'
  const fundingCapability = capabilities.data?.funding[fundingAction][mode]
  const canFund = fundingCapability?.enabled === true

  const updateFilters = (patch: Partial<WalletTransactionFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  const submitFunding = async () => {
    if (!canFund) {
      setFundingError(fundingCapability?.reason ?? 'This wallet operation is not currently enabled.')
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
      <PageHeader
        eyebrow="Funds"
        title="Wallet"
        description={canFund
          ? (isDemo ? 'Demo funding workflows are server-authoritative and fully recorded in the ledger.' : 'Real wallet operations are enabled by your current account capabilities.')
          : (fundingCapability?.reason ?? 'Wallet capabilities are being checked by the server.')}
        action="Back to trading"
      />

      <ApiState
        loading={wallet.loading || wallets.loading || capabilities.loading}
        error={wallet.error ?? wallets.error ?? capabilities.error}
        onRetry={() => { void wallet.reload(); void wallets.reload(); void transactions.reload(); void capabilities.reload() }}
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
              <span className={canFund ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>{canFund ? 'READY' : 'LOCKED'}</span>
            </div>
            <div className="wallet-funding-tabs">
              <button type="button" className={fundingAction === 'deposit' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => setFundingAction('deposit')}><ArrowDownCircle size={14} /> Deposit</button>
              <button type="button" className={fundingAction === 'withdrawal' ? 'wallet-funding-tab wallet-funding-tab--active' : 'wallet-funding-tab'} onClick={() => setFundingAction('withdrawal')}><ArrowUpCircle size={14} /> Withdraw</button>
            </div>

            {fundingAction === 'deposit' ? (
              <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100.00" disabled={!canFund || fundingSubmitting} /></div><small>Demo deposits are credited immediately, capped at $1,000,000, and create a balanced ledger transaction.</small></label>
            ) : (
              <>
                <label className="wallet-funding-field"><span>Destination</span><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Demo destination" disabled={!canFund || fundingSubmitting} /></label>
                <label className="wallet-funding-field"><span>Amount</span><div className="wallet-amount-input"><b>{wallet.data?.currency ?? 'USD'}</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="50.00" disabled={!canFund || fundingSubmitting} /></div><small>Withdrawals use available demo balance, have a $0 demo fee, and are fully ledger-recorded. Maximum $1,000,000.</small></label>
              </>
            )}

            <button type="button" className="btn btn--primary" onClick={() => void submitFunding()} disabled={!canFund || fundingSubmitting || !amount.trim() || (fundingAction === 'withdrawal' && !destination.trim())}>
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
            <div className="wallet-filter-control">
              <span>Type</span>
              <Select
                value={filters.type ?? ''}
                options={[
                  { value: '', label: 'All types' },
                  { value: 'DEPOSIT', label: 'Deposit' },
                  { value: 'WITHDRAWAL', label: 'Withdrawal' },
                  { value: 'TRADE_HOLD', label: 'Trade hold' },
                  { value: 'SETTLEMENT', label: 'Settlement' },
                  { value: 'FEE', label: 'Fee' },
                  { value: 'ADJUSTMENT', label: 'Adjustment' },
                ]}
                onChange={(value) => updateFilters({ type: (value || undefined) as WalletTransactionFilters['type'] })}
                className="wallet-filter-select"
              />
            </div>
            <div className="wallet-filter-control">
              <span>Status</span>
              <Select
                value={filters.status ?? ''}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'PROCESSING', label: 'Processing' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'FAILED', label: 'Failed' },
                  { value: 'REJECTED', label: 'Rejected' },
                ]}
                onChange={(value) => updateFilters({ status: (value || undefined) as WalletTransactionFilters['status'] })}
                className="wallet-filter-select"
              />
            </div>
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
  const { mode } = useWalletMode()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | 'OPEN' | 'WON' | 'LOST' | 'DRAW' | 'CANCELLED' | 'EXPIRED'>('')
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
        const result = await tradesApi.list({ page: exportPage, pageSize: 100, status: status || undefined, ...filters }, mode)
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
              { value: 'DRAW', label: 'Draw' },
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
                <span className={trade.status === 'WON' ? 'status-pill status-pill--positive' : trade.status === 'LOST' ? 'status-pill status-pill--negative' : trade.status === 'DRAW' ? 'status-pill status-pill--draw' : 'status-pill status-pill--pending'}>
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
  const { unreadCount } = useNotificationStore()
  const reloadNotifications = notifications.reload
  const reloadUnread = unread.reload
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    if (unread.data) setUnreadCount(unread.data.pagination.total)
  }, [unread.data])

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
      recordNotificationEvent()
      void reloadUnread()
    })
  }, [reloadNotifications, reloadUnread, realtime])

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id)
    decrementUnreadCount()
    await Promise.all([notifications.reload(), unread.reload()])
  }

  const markAllRead = async () => {
    if (!unreadCount) return
    await notificationsApi.markAllRead()
    setUnreadCount(0)
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
                  {unreadItem ? <button type="button" className="notification-read-button" aria-label={'Mark "' + item.title + '" as read'} onClick={() => void markRead(item.id)}>Mark read</button> : <span className="notification-read-label">Read</span>}
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

type _PreferencesStateKeys = {
  compactTradingLayout: boolean
  priceMovementAlerts: boolean
  soundEnabled: boolean
  emailTradeResults: boolean
  emailWalletUpdates: boolean
  emailSecurityAlerts: boolean
  emailAnnouncements: boolean
  emailSupportUpdates: boolean
}
function AccountPage() {
  const { user, refresh } = useAuth()
  const { compactTradingLayout, priceMovementAlerts, soundEnabled, emailTradeResults, emailWalletUpdates, emailSecurityAlerts, emailAnnouncements, emailSupportUpdates } = usePreferences()
  const preferences = useAuthPreferences()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '')
  const [timezone, setTimezone] = useState(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [locale, setLocale] = useState(user?.locale ?? navigator.language)
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const togglePreference = async (key: keyof _PreferencesStateKeys, enabled: boolean) => {
    if (key === 'compactTradingLayout') setCompactTradingLayout(enabled)
    if (key === 'priceMovementAlerts') setPriceMovementAlerts(enabled)
    if (key === 'soundEnabled') setSoundEnabled(enabled)
    setServerPreferences({ [key]: enabled })
    try {
      const next = await authApi.updatePreferences({ [key]: enabled })
      setServerPreferences(next)
      if (key === 'soundEnabled') setSoundEnabled(next.soundEnabled)
    } catch {
      setServerPreferences({ [key]: !enabled })
      if (key === 'compactTradingLayout') setCompactTradingLayout(!enabled)
      if (key === 'priceMovementAlerts') setPriceMovementAlerts(!enabled)
      if (key === 'soundEnabled') setSoundEnabled(!enabled)
    }
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError(null)
    setProfileMessage(null)
    try {
      await authApi.updateProfile({
        displayName: displayName.trim() || null,
        countryCode: countryCode.trim().toUpperCase() || null,
        timezone: timezone.trim() || null,
        locale: locale.trim() || null,
      })
      await refresh()
      setProfileMessage('Profile saved.')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordBusy(true)
    setPasswordError(null)
    setPasswordMessage(null)
    if (newPassword !== confirmPassword) {
      setPasswordBusy(false)
      setPasswordError('New passwords do not match.')
      return
    }
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage('Password changed. Other active sessions were signed out.')
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change password.')
    } finally {
      setPasswordBusy(false)
    }
  }

  const preferenceRows = [
    { key: 'compactTradingLayout' as const, label: 'Compact trading layout', description: 'Tightens the trading workspace spacing.', enabled: compactTradingLayout },
    { key: 'priceMovementAlerts' as const, label: 'Price movement alerts', description: 'Keep market-movement alerts enabled for this account.', enabled: priceMovementAlerts },
    { key: 'soundEnabled' as const, label: 'Sound effects', description: 'Play trade result sounds when enabled.', enabled: soundEnabled },
    { key: 'emailTradeResults' as const, label: 'Trade result emails', description: 'Receive email when a trade is settled.', enabled: emailTradeResults },
    { key: 'emailWalletUpdates' as const, label: 'Wallet emails', description: 'Receive deposit and withdrawal notifications by email.', enabled: emailWalletUpdates },
    { key: 'emailSecurityAlerts' as const, label: 'Security emails', description: 'Receive security and account-protection alerts.', enabled: emailSecurityAlerts },
    { key: 'emailAnnouncements' as const, label: 'System announcements', description: 'Receive important platform announcements by email.', enabled: emailAnnouncements },
    { key: 'emailSupportUpdates' as const, label: 'Support emails', description: 'Receive email when support replies to your tickets.', enabled: emailSupportUpdates },
  ]

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Account" title="Account settings" description="Manage your profile, password, workspace behavior and notification delivery." action="Back to trading" />
      <div className="account-layout account-layout--wide">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Profile</span><h2>Personal details</h2></div><span className="status-pill status-pill--positive">{user?.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}</span></div>
          <div className="profile-card"><span className="profile-avatar">{avatarFor(user?.email)}</span><div><strong>{user?.displayName || user?.email || 'Account'}</strong><small>{user?.email}</small></div></div>
          <form className="account-form" onSubmit={(event) => void saveProfile(event)}>
            <div className="form-grid">
              <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} placeholder="Your name" /></label>
              <label><span>Email</span><input value={user?.email ?? ''} readOnly type="email" /></label>
              <label><span>Country</span><input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} maxLength={2} placeholder="LK" /></label>
              <label><span>Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={64} placeholder="Asia/Colombo" /></label>
              <label><span>Language / locale</span><input value={locale} onChange={(event) => setLocale(event.target.value)} maxLength={35} placeholder="en-US" /></label>
            </div>
            {profileError ? <div className="form-message form-message--error" role="alert">{profileError}</div> : null}
            {profileMessage ? <div className="form-message form-message--success" role="status">{profileMessage}</div> : null}
            <button type="submit" className="setting-button setting-button--primary" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button>
          </form>
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Security</span><h2>Change password</h2></div></div>
          <form className="account-form" onSubmit={(event) => void changePassword(event)}>
            <label><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label><span>New password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>Use at least 12 characters.</small></label>
            <label><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            {passwordError ? <div className="form-message form-message--error" role="alert">{passwordError}</div> : null}
            {passwordMessage ? <div className="form-message form-message--success" role="status">{passwordMessage}</div> : null}
            <button type="submit" className="setting-button setting-button--primary" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Change password'}</button>
          </form>
        </section>

        <aside className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Preferences</span><h2>Workspace &amp; email</h2></div><span className="status-pill status-pill--pending">{preferences.loading ? 'SYNCING' : 'SYNCED'}</span></div>
          {preferenceRows.map((row) => (
            <div className="setting-row" key={row.key}>
              <div><strong>{row.label}</strong><small>{row.description}</small></div>
              <button type="button" role="switch" aria-checked={row.enabled} className={row.enabled ? 'toggle toggle--on' : 'toggle'} onClick={() => void togglePreference(row.key, !row.enabled)} title={row.enabled ? 'Disable ' + row.label : 'Enable ' + row.label}><span /></button>
            </div>
          ))}
          <div className="dashboard-note">Email delivery is active only when the platform has a configured email provider. In-app notifications remain available regardless.</div>
        </aside>
      </div>
    </div>
  )
}

function SupportPage() {
  const [ticketPage, setTicketPage] = useState(1)
  const tickets = useSupportTickets(ticketPage, 20)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const selectedTicket = useSupportTicket(selectedTicketId)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<SupportCategory>('TECHNICAL')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTicket = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ticket = await supportApi.create({ subject, category, body: message })
      setSubject('')
      setMessage('')
      setSelectedTicketId(ticket.id)
      await tickets.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create support ticket.')
    } finally {
      setBusy(false)
    }
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTicketId || !reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      await supportApi.reply(selectedTicketId, reply)
      setReply('')
      await Promise.all([selectedTicket.reload(), tickets.reload()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send reply.')
    } finally {
      setBusy(false)
    }
  }

  const closeTicket = async () => {
    if (!selectedTicketId) return
    setBusy(true)
    setError(null)
    try {
      await supportApi.close(selectedTicketId)
      await Promise.all([selectedTicket.reload(), tickets.reload()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to close ticket.')
    } finally {
      setBusy(false)
    }
  }

  const statusClass = (status: string) => status === 'CLOSED' || status === 'RESOLVED'
    ? 'status-pill status-pill--positive'
    : status === 'WAITING_USER'
      ? 'status-pill status-pill--pending'
      : 'status-pill status-pill--draw'

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Help center" title="Support" description="Create a ticket and continue the conversation with the SL Spot support team." />
      <div className="support-layout support-layout--tickets">
        <section className="dashboard-card panel">
          <div className="dashboard-card__header"><div><span className="eyebrow">Your tickets</span><h2>Support inbox</h2></div><span className="status-pill status-pill--pending">{tickets.data?.pagination.total ?? 0}</span></div>
          {error ? <div className="form-message form-message--error" role="alert">{error}</div> : null}
          <ApiState loading={tickets.loading} error={tickets.error} onRetry={() => void tickets.reload()}>
            <div className="support-ticket-list">
              {(tickets.data?.items ?? []).map((ticket) => (
                <button type="button" key={ticket.id} className={ticket.id === selectedTicketId ? 'support-ticket-row support-ticket-row--active' : 'support-ticket-row'} onClick={() => setSelectedTicketId(ticket.id)}>
                  <span><strong>{ticket.subject}</strong><small>{ticket.category} · {ticket.messageCount} message{ticket.messageCount === 1 ? '' : 's'}</small></span>
                  <span><span className={statusClass(ticket.status)}>{ticket.status.replaceAll('_', ' ')}</span><small>{formatDateTime(ticket.updatedAt)}</small></span>
                </button>
              ))}
              {tickets.data?.items.length === 0 ? <div className="dashboard-note">No support tickets yet.</div> : null}
            </div>
            {tickets.data ? <Pagination page={ticketPage} totalPages={tickets.data.pagination.totalPages} onChange={setTicketPage} /> : null}
          </ApiState>
        </section>

        <section className="dashboard-card panel">
          {selectedTicketId && selectedTicket.loading ? <div className="dashboard-note" role="status">Loading ticket…</div> : null}
          {selectedTicketId && selectedTicket.error ? <ApiState loading={false} error={selectedTicket.error} onRetry={() => void selectedTicket.reload()}>{null}</ApiState> : null}
          {selectedTicket.data ? (
            <>
              <div className="dashboard-card__header"><div><span className="eyebrow">{selectedTicket.data.category}</span><h2>{selectedTicket.data.subject}</h2></div><span className={statusClass(selectedTicket.data.status)}>{selectedTicket.data.status.replaceAll('_', ' ')}</span></div>
              <div className="support-thread">
                {selectedTicket.data.messages.map((item) => (
                  <article className={item.author.admin ? 'support-message support-message--agent' : 'support-message'} key={item.id}>
                    <div><strong>{item.author.displayName || (item.author.admin ? 'SL Spot Support' : 'You')}</strong><small>{formatDateTime(item.createdAt)}</small></div>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
              {selectedTicket.data.status === 'CLOSED' ? <div className="dashboard-note">This ticket is closed. Create a new ticket for another issue.</div> : (
                <form className="support-reply-form" onSubmit={(event) => void sendReply(event)}>
                  <label><span>Reply</span><textarea rows={4} maxLength={10000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Add more details or reply to support…" /></label>
                  <div className="action-row"><button type="submit" className="setting-button setting-button--primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button><button type="button" className="setting-button" disabled={busy} onClick={() => void closeTicket()}>Close ticket</button></div>
                </form>
              )}
            </>
          ) : selectedTicketId ? (
            <div className="dashboard-note" role="status">Loading ticket conversation…</div>
          ) : (
            <form className="support-create-form" onSubmit={(event) => void createTicket(event)}>
              <div className="dashboard-card__header"><div><span className="eyebrow">New request</span><h2>Contact support</h2></div></div>
              <p>Tell us what happened. Include the relevant page, asset or trade ID when applicable.</p>
              <label><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} required placeholder="What do you need help with?" /></label>
              <div className="support-category-field">
                <Select
                  label="Category"
                  value={category}
                  options={[
                    { value: 'ACCOUNT', label: 'Account' },
                    { value: 'TRADING', label: 'Trading' },
                    { value: 'WALLET', label: 'Wallet' },
                    { value: 'TECHNICAL', label: 'Technical' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                  onChange={(value) => setCategory(value as SupportCategory)}
                />
              </div>
              <label><span>Message</span><textarea rows={8} maxLength={10000} value={message} onChange={(event) => setMessage(event.target.value)} required placeholder="Describe the issue…" /></label>
              <button type="submit" className="setting-button setting-button--primary" disabled={busy || !subject.trim() || !message.trim()}>{busy ? 'Submitting…' : 'Create support ticket'}</button>
            </form>
          )}
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

function formatDateTime(value: string): string {
  return formatLocalDateTime(value, { dateStyle: 'short', fallback: value })
}

function signedMoney(value: string | null | undefined): string {
  const amount = Number(value ?? 0)
  return (amount >= 0 ? '+' : '-') + formatMoney(Math.abs(amount).toFixed(8))
}


function avatarFor(email: string | undefined): string {
  if (!email) return 'SL'
  const first = email[0]?.toUpperCase() ?? 'S'
  const second = email.includes('@') ? email[email.indexOf('@') + 1]?.toUpperCase() ?? 'L' : 'L'
  return first + second
}
