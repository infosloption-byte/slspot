import { ArrowUpRight, BarChart3, Bell, Check, Clock3, DollarSign, PieChart, ShieldCheck, Smartphone, TrendingUp, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Pagination } from '../components/ui/Pagination'
import { ApiState } from '../components/ui/ApiState'
import { formatPercent, formatPrice } from '../lib/format'
import { notificationsApi } from '../api/notifications'
import { authApi } from '../api/auth'
import { useAuth } from '../auth/AuthProvider'
import { useWalletMode } from '../hooks/useWalletMode'
import { useAuthSessions, useMarketAssets, useNotifications, usePortfolioPositions, usePortfolioSummary, useTrades, useWallet, useWalletTransactions, useWallets } from '../hooks/useServerState'

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

function DashboardPage() {
  const summary = usePortfolioSummary()
  const trades = useTrades(1, 10)
  const markets = useMarketAssets(10)

  const winRate = useMemo(() => {
    const records = trades.data?.items ?? []
    const resolved = records.filter((item) => item.status === 'WON' || item.status === 'LOST')
    if (resolved.length === 0) return null
    return resolved.filter((item) => item.status === 'WON').length / resolved.length * 100
  }, [trades.data])

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Overview" title="Dashboard" description="Server-backed account, trading and market activity." />

      <ApiState
        loading={summary.loading || trades.loading}
        error={summary.error ?? trades.error}
        onRetry={() => { void summary.reload(); void trades.reload() }}
      >
        <div className="dashboard-stats">
          <StatCard label="Total balance" value={formatMoney(summary.data?.totalBalance, summary.data?.currency)} change={summary.data?.currency ?? 'USD'} positive icon={WalletCards} />
          <StatCard label="Net P&L" value={signedMoney(summary.data?.netPnl)} change="All recorded trades" positive={Number(summary.data?.netPnl ?? 0) >= 0} icon={TrendingUp} />
          <StatCard label="Recent win rate" value={winRate === null ? '—' : formatPercent(winRate)} change="Last 10 trades" positive icon={BarChart3} />
          <StatCard label="Open positions" value={String(summary.data?.openPositionCount ?? 0)} change={String(summary.data?.tradeCount ?? 0) + ' trades total'} positive icon={DollarSign} />
        </div>
      </ApiState>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card--performance panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Portfolio</span><h2>Balance</h2></div>
            <span className="dashboard-card__value">{formatMoney(summary.data?.totalBalance, summary.data?.currency)}</span>
          </div>
          <div className="return-summary">
            <div><span>Available</span><strong>{formatMoney(summary.data?.availableBalance, summary.data?.currency)}</strong></div>
            <div><span>Held</span><strong>{formatMoney(summary.data?.heldBalance, summary.data?.currency)}</strong></div>
            <div><span>Open positions</span><strong>{summary.data?.openPositionCount ?? 0}</strong></div>
            <div><span>Net P&amp;L</span><strong className={Number(summary.data?.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(summary.data?.netPnl)}</strong></div>
          </div>
        </section>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Activity</span><h2>Recent trades</h2></div>
            <Link to="/app/history" className="dashboard-link">View all <ArrowUpRight size={13} /></Link>
          </div>
          <div className="recent-trades">
            {(trades.data?.items ?? []).slice(0, 5).map((trade) => (
              <div className="recent-trade" key={trade.id}>
                <span className="recent-trade__icon">{trade.position.asset.symbol.slice(0, 1)}</span>
                <div>
                  <strong>{trade.position.asset.symbol}</strong>
                  <small>{trade.position.side} · {formatMoney(trade.position.amount)} · {trade.status}</small>
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
            <div><span className="eyebrow">Cash</span><h2>Wallet balance</h2></div>
            <PieChart size={16} className="dashboard-muted-icon" />
          </div>
          <div className="exposure-meter">
            <div className="exposure-meter__track">
              <span style={{ width: Math.min(100, (Number(summary.data?.heldBalance ?? 0) / Math.max(1, Number(summary.data?.totalBalance ?? 1))) * 100) + '%' }} />
            </div>
            <div><strong>{formatMoney(summary.data?.heldBalance, summary.data?.currency)}</strong><small>currently held</small></div>
          </div>
          <div className="dashboard-note"><Clock3 size={14} /> Wallet mutations will be enabled after the ledger/payment milestones.</div>
        </section>
      </div>
    </div>
  )
}

function PortfolioPage() {
  const summary = usePortfolioSummary()
  const [page, setPage] = useState(1)
  const positions = usePortfolioPositions(page, 10)

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Analytics" title="Performance" description="Review server-backed balances, open positions and account composition." />
      <ApiState
        loading={summary.loading || positions.loading}
        error={summary.error ?? positions.error}
        onRetry={() => { void summary.reload(); void positions.reload() }}
      >
        <div className="dashboard-stats">
          <StatCard label="Total balance" value={formatMoney(summary.data?.totalBalance, summary.data?.currency)} change={summary.data?.currency ?? 'USD'} positive icon={WalletCards} />
          <StatCard label="Available" value={formatMoney(summary.data?.availableBalance, summary.data?.currency)} change="Spendable balance" positive icon={DollarSign} />
          <StatCard label="Held" value={formatMoney(summary.data?.heldBalance, summary.data?.currency)} change="Reserved balance" positive icon={PieChart} />
        </div>

        <div className="portfolio-layout">
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Positions</span><h2>Positions</h2></div>
              <span className="status-pill status-pill--pending">{positions.data?.pagination.total ?? 0} RECORDS</span>
            </div>
            <div className="holdings-list">
              {(positions.data?.items ?? []).map((position) => (
                <div className="holding" key={position.id}>
                  <span className="holding__icon">{position.asset.symbol.slice(0, 1)}</span>
                  <div className="holding__identity"><strong>{position.asset.symbol}</strong><small>{position.side} · {position.status}</small></div>
                  <div className="holding__allocation">
                    <span><b>{formatMoney(position.amount, summary.data?.currency)}</b><small>Entry {formatPrice(Number(position.entryPrice))}</small></span>
                    <div className="allocation-track"><span style={{ width: '100%' }} /></div>
                  </div>
                  <span>{position.closedAt ? formatDateTime(position.closedAt) : 'Open'}</span>
                </div>
              ))}
            </div>
            {positions.data?.items.length === 0 ? <div className="dashboard-note">No positions have been recorded yet.</div> : null}
            {positions.data ? <Pagination page={page} totalPages={positions.data.pagination.totalPages} onChange={setPage} /> : null}
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Summary</span><h2>Account performance</h2></div>
              <TrendingUp size={16} className="dashboard-muted-icon" />
            </div>
            <div className="return-summary">
              <div><span>Net P&amp;L</span><strong className={Number(summary.data?.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{signedMoney(summary.data?.netPnl)}</strong></div>
              <div><span>Total trades</span><strong>{summary.data?.tradeCount ?? 0}</strong></div>
              <div><span>Open positions</span><strong>{summary.data?.openPositionCount ?? 0}</strong></div>
              <div><span>Available</span><strong>{formatMoney(summary.data?.availableBalance, summary.data?.currency)}</strong></div>
            </div>
            <div className="dashboard-note"><ArrowUpRight size={14} /> Analytics are sourced from server state.</div>
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
  const transactions = useWalletTransactions(page, 10)
  const isDemo = mode === 'DEMO'

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Funds"
        title="Wallet"
        description={isDemo
          ? 'Practice with server-backed demo funds that refill automatically when your balance is exhausted.'
          : 'View your real wallet. Payment deposits are not available yet.'}
        action="Back to trading"
      />

      <ApiState
        loading={wallet.loading || transactions.loading || wallets.loading}
        error={wallet.error ?? transactions.error ?? wallets.error}
        onRetry={() => {
          void wallet.reload()
          void wallets.reload()
          void transactions.reload()
        }}
      >
        <div className="dashboard-stats">
          <StatCard label="Available balance" value={formatMoney(wallet.data?.availableBalance, wallet.data?.currency)} change={isDemo ? 'Demo wallet' : 'Real wallet'} positive icon={WalletCards} />
          <StatCard label="Held balance" value={formatMoney(wallet.data?.heldBalance, wallet.data?.currency)} change="Reserved" positive icon={DollarSign} />
          <StatCard label="Total balance" value={formatMoney(wallet.data?.totalBalance, wallet.data?.currency)} change="Available + held" positive icon={TrendingUp} />
          <StatCard label="Transactions" value={String(transactions.data?.pagination.total ?? 0)} change={isDemo ? 'Demo wallet activity' : 'Real wallet activity'} positive icon={Clock3} />
        </div>

        <div className="wallet-grid">
          <section className="dashboard-card panel wallet-funding-card">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Wallet mode</span><h2>{isDemo ? 'Demo wallet' : 'Real wallet'}</h2></div>
              <span className={isDemo ? 'status-pill status-pill--positive' : 'status-pill status-pill--pending'}>
                {isDemo ? 'AUTO-FUNDED' : 'COMING SOON'}
              </span>
            </div>

            <div className="wallet-balance-switcher">
              {(['DEMO', 'REAL'] as const).map((walletMode) => {
                const item = wallets.data?.find((entry) => entry.mode === walletMode)
                const active = walletMode === mode
                return (
                  <button
                    key={walletMode}
                    type="button"
                    className={active ? 'wallet-balance-option wallet-balance-option--active' : 'wallet-balance-option'}
                    onClick={() => {
                      setMode(walletMode)
                      setPage(1)
                    }}
                  >
                    <span>{walletMode === 'DEMO' ? 'Demo' : 'Real'}</span>
                    <strong>{formatMoney(item?.availableBalance, item?.currency)}</strong>
                    <small>{walletMode === 'DEMO' ? 'Practice funds' : 'Live funds'}</small>
                  </button>
                )
              })}
            </div>

            {isDemo ? (
              <div className="wallet-funding-state wallet-funding-state--demo">
                <span className="wallet-funding-state__icon"><WalletCards size={20} /></span>
                <div>
                  <strong>Ready for practice trading</strong>
                  <p>Your demo balance is isolated from the real wallet. When the demo balance reaches zero and no funds are held, it automatically refills to the configured demo starting balance.</p>
                </div>
              </div>
            ) : (
              <div className="wallet-funding-state">
                <span className="wallet-funding-state__icon"><ShieldCheck size={20} /></span>
                <div>
                  <strong>Real deposits are not available yet</strong>
                  <p>Payment processing has not been connected yet, so this wallet cannot be funded. The real wallet remains separate from demo trading funds.</p>
                </div>
              </div>
            )}
          </section>

          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Funding</span><h2>{isDemo ? 'Demo wallet rules' : 'Real wallet status'}</h2></div>
              <ShieldCheck size={16} className="dashboard-muted-icon" />
            </div>
            {isDemo ? (
              <>
                <div className="setting-row"><div><strong>Manual deposits</strong><small>Disabled. Demo funds are controlled automatically by the platform.</small></div><span className="status-pill status-pill--positive">AUTO</span></div>
                <div className="setting-row"><div><strong>Auto-refill</strong><small>Refills after the demo balance reaches zero with no active held funds.</small></div><span className="status-pill status-pill--positive">ON</span></div>
                <div className="setting-row"><div><strong>Real money</strong><small>Demo trades never spend real wallet funds.</small></div><span className="status-pill status-pill--positive">ISOLATED</span></div>
              </>
            ) : (
              <>
                <div className="setting-row"><div><strong>Deposits</strong><small>Payment integration will be implemented in a later release.</small></div><span className="status-pill status-pill--pending">SOON</span></div>
                <div className="setting-row"><div><strong>Withdrawals</strong><small>Production withdrawals remain server-gated until funding is enabled.</small></div><span className="status-pill status-pill--pending">LOCKED</span></div>
                <div className="setting-row"><div><strong>Balance</strong><small>Real wallet starts at zero until a real deposit is completed.</small></div><span className="status-pill status-pill--positive">SEPARATE</span></div>
              </>
            )}
          </section>
        </div>

        <section className="dashboard-card panel">
          <div className="dashboard-card__header">
            <div><span className="eyebrow">Transactions</span><h2>{isDemo ? 'Demo wallet activity' : 'Real wallet activity'}</h2></div>
            <span className="status-pill status-pill--pending">{transactions.data?.pagination.total ?? 0} RECORDS</span>
          </div>
          <div className="data-table">
            <div className="data-table__row data-table__row--header"><span>Activity</span><span>Type</span><span>Amount</span><span>Status</span><span>Time</span></div>
            {(transactions.data?.items ?? []).map((item) => (
              <div className="data-table__row" key={item.id}>
                <div><strong>{item.description ?? item.type}</strong><small>{item.referenceType ?? 'Wallet transaction'}</small></div>
                <span>{item.type}</span>
                <strong>{formatMoney(item.amount, item.currency)}</strong>
                <span className="status-pill status-pill--pending">{item.status}</span>
                <small>{formatDateTime(item.createdAt)}</small>
              </div>
            ))}
          </div>
          {transactions.data?.items.length === 0 ? <div className="dashboard-note">No {isDemo ? 'demo' : 'real'} wallet transactions have been recorded yet.</div> : null}
          {transactions.data ? <Pagination page={page} totalPages={transactions.data.pagination.totalPages} onChange={setPage} /> : null}
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
  const [page, setPage] = useState(1)
  const notifications = useNotifications(page, 10)
  const unreadCount = (notifications.data?.items ?? []).filter((item) => !item.readAt).length

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id)
    await notifications.reload()
  }

  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Activity" title="Notifications" description="Trade, market and security events from the server." />
      <ApiState loading={notifications.loading} error={notifications.error} onRetry={() => void notifications.reload()}>
        <div className="notification-layout">
          <section className="dashboard-card panel">
            <div className="dashboard-card__header">
              <div><span className="eyebrow">Inbox</span><h2>Recent activity</h2></div>
              <span className="status-pill status-pill--pending">{unreadCount} UNREAD ON THIS PAGE</span>
            </div>
            <div className="notification-list">
              {(notifications.data?.items ?? []).map((item) => {
                const Icon = iconForNotification[item.type]
                const unread = !item.readAt
                return (
                  <article className={unread ? 'notification-item notification-item--unread' : 'notification-item'} key={item.id} onClick={() => unread && void markRead(item.id)}>
                    <span className="notification-item__icon"><Icon size={14} /></span>
                    <div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDateTime(item.createdAt)}</small></div>
                    <span className="notification-dot" />
                  </article>
                )
              })}
            </div>
            {notifications.data?.items.length === 0 ? <div className="dashboard-note">You have no notifications.</div> : null}
            {notifications.data ? <Pagination page={page} totalPages={notifications.data.pagination.totalPages} onChange={setPage} /> : null}
          </section>
        </div>
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
