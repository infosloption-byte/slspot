import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Database, Download,
  KeyRound, LayoutDashboard, LifeBuoy, LogOut, Megaphone, Radio, RefreshCw, Search, ShieldAlert, ShieldCheck, UserRound,
  Users, WalletCards, XCircle,
} from 'lucide-react'
import {
  AdminApiError, adminApi, type AssetRecord, type AuditRecord, type Dashboard, type FundingRecord,
  type AnnouncementRecord, type LedgerRecord, type List, type PositionRecord, type Reconciliation, type RiskSummary,
  type RealMoneyGateStatus, type RealMoneyGateSettings, type SettlementRecord, type SupportTicketDetail, type SupportTicketRecord, type TradeRecord, type UserDetail, type UserRecord, type WalletRecord, type PaymentWithdrawalReviewRecord,
} from './api'

type Page = 'dashboard' | 'users' | 'trading' | 'finance' | 'support' | 'announcements' | 'risk' | 'audit' | 'launch-gate'
type TradingView = 'trades' | 'positions' | 'settlements' | 'assets'
type FinanceView = 'wallets' | 'deposits' | 'withdrawals' | 'withdrawal-review' | 'payout-reconciliation' | 'reconciliation' | 'ledger'

const pages: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'trading', label: 'Trading', icon: BarChart3 },
  { id: 'finance', label: 'Finance', icon: WalletCards },
  { id: 'launch-gate', label: 'Launch Gate', icon: ShieldCheck },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'audit', label: 'Audit', icon: Activity },
]

function amount(value: string | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value ?? '0'
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—'
}

function tagClass(value: string) {
  if (['ACTIVE', 'OPEN', 'COMPLETED', 'WON', 'APPROVED'].includes(value)) return 'tag tag--good'
  if (['DISABLED', 'SUSPENDED', 'FAILED', 'REJECTED', 'HALTED'].includes(value)) return 'tag tag--bad'
  return 'tag'
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function Table({ children }: { children: ReactNode }) {
  return <div className="table-wrap"><table className="admin-table">{children}</table></div>
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="notice notice--error" role="alert"><XCircle size={17} /><span>{message}</span><button type="button" className="button button--ghost button--small" onClick={onRetry}>Retry</button></div>
}

function Splash() {
  return <main className="splash"><Activity size={22} className="spin" /> Checking administrator access…</main>
}

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = challenge
        ? await adminApi.verify2fa(challenge, code)
        : await adminApi.login(email, password)
      if (result.requiresTwoFactor && result.challengeToken) setChallenge(result.challengeToken)
      else onAuthenticated()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="brand-lockup"><span className="brand-mark">S</span><div><strong>SL Spot</strong><small>Administrator console</small></div></div>
      <div className="login-heading"><span className="eyebrow">Restricted access</span><h1>{challenge ? 'Verify administrator sign-in' : 'Administrator sign-in'}</h1><p>Active SL Spot accounts with administrator access can enter this console.</p></div>
      {error ? <ErrorNotice message={error} onRetry={() => setError('')} /> : null}
      {challenge ? (
        <label className="field"><span>Authenticator code</span><input autoFocus inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
      ) : <>
        <label className="field"><span>Email</span><input autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      </>}
      <button className="button button--primary button--wide" disabled={busy || Boolean(challenge && code.length !== 6)}>{busy ? 'Authenticating…' : challenge ? 'Verify & enter' : 'Sign in'}</button>
    </form>
  </main>
}

function App() {
  const [admin, setAdmin] = useState<{ id: string; email: string; role: string } | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => { void adminApi.me().then(setAdmin).catch(() => setAdmin(null)).finally(() => setChecking(false)) }, [])
  if (checking) return <Splash />
  if (!admin) return <Login onAuthenticated={() => { void adminApi.me().then(setAdmin).catch(() => setAdmin(null)) }} />
  return <AdminShell admin={admin} onLogout={async () => { await adminApi.logout().catch(() => undefined); setAdmin(null) }} />
}

function AdminShell({ admin, onLogout }: { admin: { id: string; email: string; role: string }; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('dashboard')
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const label = useMemo(() => pages.find((item) => item.id === page)?.label ?? 'Dashboard', [page])

  return <div className="admin-shell">
    <aside className={open ? 'admin-sidebar admin-sidebar--open' : 'admin-sidebar'}>
      <div className="admin-brand"><span className="brand-mark">S</span><div><strong>SL Spot</strong><small>ADMIN</small></div></div>
      <nav aria-label="Administration">{pages.map(({ id, label: itemLabel, icon: Icon }) => <button key={id} className={page === id ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => { setPage(id); setOpen(false) }}><Icon size={18} /><span>{itemLabel}</span></button>)}</nav>
      <div className="admin-side-footer"><div className="admin-identity"><UserRound size={15} /><span>{admin.email}</span></div><span className="role-chip">{admin.role}</span><button className="nav-item nav-item--muted" onClick={() => void onLogout()}><LogOut size={17} /><span>Sign out</span></button></div>
    </aside>
    <div className={open ? 'sidebar-scrim sidebar-scrim--open' : 'sidebar-scrim'} onClick={() => setOpen(false)} />
    <section className="admin-main">
      <header className="admin-topbar"><button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">☰</button><div><span className="eyebrow">Operations</span><h1>{label}</h1></div><div className="topbar-actions"><span className="protected"><span /> Protected</span><button className="icon-button" onClick={() => setRefreshKey((v) => v + 1)} aria-label="Refresh"><RefreshCw size={17} /></button></div></header>
      <main className="admin-content">
        {page === 'dashboard' ? <DashboardPage refreshKey={refreshKey} /> : null}
        {page === 'users' ? <UsersPage refreshKey={refreshKey} /> : null}
        {page === 'trading' ? <TradingPage refreshKey={refreshKey} /> : null}
        {page === 'finance' ? <FinancePage refreshKey={refreshKey} /> : null}
        {page === 'launch-gate' ? <LaunchGatePage refreshKey={refreshKey} role={admin.role} /> : null}
        {page === 'support' ? <SupportPage refreshKey={refreshKey} /> : null}
        {page === 'announcements' ? <AnnouncementsPage refreshKey={refreshKey} /> : null}
        {page === 'risk' ? <RiskPage refreshKey={refreshKey} /> : null}
        {page === 'audit' ? <AuditPage refreshKey={refreshKey} /> : null}
      </main>
    </section>
  </div>
}

function DashboardPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  async function load() { setError(''); try { setData(await adminApi.dashboard()) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load dashboard') } }
  useEffect(() => { void load() }, [refreshKey])
  return <div className="page">
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {data ? <><section className="metrics-grid">
      <Metric label="Users" value={data.metrics.users.toLocaleString()} detail={data.metrics.activeUsers.toLocaleString() + ' active'} />
      <Metric label="Deposits / 24h" value={amount(data.metrics.deposits.amount)} detail={data.metrics.deposits.count + ' requests'} />
      <Metric label="Withdrawals / 24h" value={amount(data.metrics.withdrawals.amount)} detail={data.metrics.withdrawals.count + ' requests'} />
      <Metric label="Open trades" value={String(data.metrics.openTrades)} detail="Currently open" />
      <Metric label="Volume / 24h" value={amount(data.metrics.volume24h)} detail="Pending + accepted orders" />
      <Metric label="Open exposure" value={amount(data.metrics.openExposure)} detail="Open position amount" />
    </section><section className="panel-grid">
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">System health</span><h2>Core services</h2></div><Activity size={18} /></div><div className="health-grid"><Health label="Database" value={data.systemHealth.database} icon={<Database size={18} />} /><Health label="Redis" value={data.systemHealth.redis} icon={<Radio size={18} />} /></div></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">Snapshot</span><h2>Operational totals</h2></div><BarChart3 size={18} /></div><div className="snapshot-list"><div><span>Last refresh</span><strong>{date(data.timestamp)}</strong></div><div><span>24h volume</span><strong>{amount(data.metrics.volume24h)}</strong></div><div><span>Open exposure</span><strong>{amount(data.metrics.openExposure)}</strong></div></div></article>
    </section></> : <div className="loading-card"><Activity className="spin" size={20} /> Loading dashboard…</div>}
  </div>
}

function Health({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  const good = value === 'ready'
  return <div className="health-item"><span className={good ? 'health-icon health-icon--good' : 'health-icon'}>{icon}</span><div><strong>{label}</strong><small>{value}</small></div>{good ? <CheckCircle2 size={17} className="text-positive" /> : <XCircle size={17} className="text-negative" />}</div>
}

function UsersPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<List<UserRecord> | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load(nextStatus = status) { setError(''); try { const q = new URLSearchParams({ page: '1', pageSize: '50' }); if (search.trim()) q.set('search', search.trim()); if (nextStatus) q.set('status', nextStatus); setData(await adminApi.users('?' + q.toString())) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load users') } }
  useEffect(() => { void load() }, [refreshKey])
  async function openUser(id: string) { try { setDetail(await adminApi.user(id)) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load user') } }
  async function changeUserStatus(next: string) { if (!detail || !window.confirm('Change status to ' + next + '?')) return; setBusy(true); try { await adminApi.setUserStatus(detail.id, next); await openUser(detail.id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Could not change status') } finally { setBusy(false) } }
  async function revoke() { if (!detail || !window.confirm('Revoke all active sessions for this user?')) return; setBusy(true); try { await adminApi.revokeSessions(detail.id); await openUser(detail.id) } catch (err) { setError(err instanceof Error ? err.message : 'Could not revoke sessions') } finally { setBusy(false) } }
  return <div className="page">
    <section className="toolbar-panel"><form className="filter-row" onSubmit={(e) => { e.preventDefault(); void load() }}><label className="search-field"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email, user ID, country" /></label><select value={status} onChange={(e) => { setStatus(e.target.value); void load(e.target.value) }}><option value="">All statuses</option><option>ACTIVE</option><option>PENDING_VERIFICATION</option><option>SUSPENDED</option><option>DISABLED</option></select><button className="button button--primary">Search</button></form></section>
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">User operations</span><h2>{data?.pagination.total.toLocaleString() ?? '—'} accounts</h2></div><span className="muted-label">Click a row to inspect</span></div>{data ? <Table><thead><tr><th>User</th><th>Status</th><th>KYC</th><th>2FA</th><th>Trades</th><th>Last login</th><th /></tr></thead><tbody>{data.items.map((user) => <tr
  key={user.id}
  className="click-row"
  tabIndex={0}
  role="button"
  aria-label={'Open user ' + user.email}
  onClick={() => void openUser(user.id)}
  onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openUser(user.id)
    }
  }}
><td><strong>{user.email}</strong><small>{user.id}</small></td><td><span className={tagClass(user.status)}>{user.status}</span></td><td><span className="tag">{user.kycStatus}</span></td><td>{user.twoFactorEnabled ? <CheckCircle2 size={17} className="text-positive" /> : 'Off'}</td><td>{user._count.trades}</td><td>{date(user.lastLoginAt)}</td><td><ChevronRight size={17} /></td></tr>)}</tbody></Table> : <div className="loading-card"><Activity className="spin" size={20} /> Loading users…</div>}</section>
    {detail ? <aside className="detail-panel" aria-label="User details"><div className="panel-heading"><div><span className="eyebrow">User detail</span><h2>{detail.email}</h2><small>{detail.id}</small></div><button className="icon-button" onClick={() => setDetail(null)} aria-label="Close details">×</button></div>
      <div className="detail-grid">{[['Status', detail.status], ['KYC', detail.kycCases[0]?.status ?? 'NOT_STARTED'], ['Country', detail.countryCode ?? '—'], ['2FA', detail.twoFactorEnabled ? 'Enabled' : 'Disabled'], ['Created', date(detail.createdAt)], ['Last login', date(detail.lastLoginAt)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="subsection"><span className="eyebrow">Policy acceptance history</span>{detail.policyAcceptances.length ? detail.policyAcceptances.map((acceptance) => <div className="session-row" key={acceptance.id}><div><strong>{acceptance.policyType.split('_').join(' ')}</strong><small>Version {acceptance.version} · {acceptance.source}</small></div><span className="tag">{date(acceptance.acceptedAt)}</span></div>) : <div className="empty-state">No versioned policy acceptance records recorded.</div>}</div>
      <div className="action-row"><button disabled={busy || detail.status === 'ACTIVE'} className="button button--primary" onClick={() => void changeUserStatus('ACTIVE')}>Activate</button><button disabled={busy || detail.status === 'SUSPENDED'} className="button button--danger" onClick={() => void changeUserStatus('SUSPENDED')}>Suspend</button><button disabled={busy || detail.status === 'DISABLED'} className="button button--ghost" onClick={() => void changeUserStatus('DISABLED')}>Restrict</button><button disabled={busy} className="button button--ghost" onClick={() => void revoke()}><KeyRound size={15} /> Revoke sessions</button></div>
      <div className="subsection"><span className="eyebrow">Accounts & wallets</span>{detail.accounts.map((account) => <div className="account-row" key={account.id}><div><strong>{account.name}</strong><small>{account.mode} · {account.status}</small></div>{account.wallets.map((wallet) => <span key={wallet.id} className="balance-chip">{wallet.currency} {amount(wallet.availableBalance)}</span>)}</div>)}</div>
      <div className="subsection"><span className="eyebrow">Recent sessions</span>{detail.sessions.slice(0, 8).map((session) => <div className="session-row" key={session.id}><div><strong>{session.userAgent ?? 'Unknown device'}</strong><small>{session.ipAddress ?? 'No IP'} · {date(session.createdAt)}</small></div><span className={session.revokedAt ? 'tag' : 'tag tag--good'}>{session.revokedAt ? 'REVOKED' : 'ACTIVE'}</span></div>)}</div>
    </aside> : null}
  </div>
}

function TradingPage({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<TradingView>('trades')
  const [trades, setTrades] = useState<List<TradeRecord> | null>(null)
  const [positions, setPositions] = useState<List<PositionRecord> | null>(null)
  const [settlements, setSettlements] = useState<List<SettlementRecord> | null>(null)
  const [assets, setAssets] = useState<AssetRecord[] | null>(null)
  const [error, setError] = useState('')
  async function load() { setError(''); try { const [t, p, s, a] = await Promise.all([adminApi.trades(), adminApi.positions(), adminApi.settlements(), adminApi.assets()]); setTrades(t); setPositions(p); setSettlements(s); setAssets(a) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load trading data') } }
  useEffect(() => { void load() }, [refreshKey])
  return <div className="page"><section className="toolbar-panel tab-row">{(['trades', 'positions', 'settlements', 'assets'] as TradingView[]).map((item) => <button key={item} className={view === item ? 'tab tab--active' : 'tab'} onClick={() => setView(item)}>{item}</button>)}</section>{error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}<section className="panel">
    {view === 'trades' && trades ? <Table><thead><tr><th>Trade</th><th>User</th><th>Asset</th><th>Amount</th><th>P&L</th><th>Status</th><th>Opened</th></tr></thead><tbody>{trades.items.map((row) => <tr key={row.id}><td><strong>{row.id.slice(0, 8)}</strong><small>{row.position.side} · {row.position.order.durationSeconds ?? 0}s</small></td><td>{row.user.email}</td><td>{row.position.asset.symbol}</td><td>{amount(row.position.amount)}</td><td className={Number(row.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{amount(row.netPnl)}</td><td><span className={tagClass(row.status)}>{row.status}</span></td><td>{date(row.openedAt)}</td></tr>)}</tbody></Table> : null}
    {view === 'positions' && positions ? <Table><thead><tr><th>Position</th><th>User</th><th>Asset</th><th>Side</th><th>Amount</th><th>Entry</th><th>Opened</th></tr></thead><tbody>{positions.items.map((row) => <tr key={row.id}><td>{row.id.slice(0, 8)}</td><td>{row.user.email}</td><td>{row.asset.symbol}</td><td>{row.side}</td><td>{amount(row.amount)}</td><td>{row.entryPrice}</td><td>{date(row.openedAt)}</td></tr>)}</tbody></Table> : null}
    {view === 'settlements' && settlements ? <Table><thead><tr><th>Settlement</th><th>User</th><th>Asset</th><th>Gross payout</th><th>Net P&L</th><th>Status</th><th>Settled</th></tr></thead><tbody>{settlements.items.map((row) => <tr key={row.id}><td>{row.id.slice(0, 8)}</td><td>{row.trade.user.email}</td><td>{row.trade.position.asset.symbol}</td><td>{amount(row.grossPayout)}</td><td>{amount(row.netPnl)}</td><td><span className={tagClass(row.status)}>{row.status}</span></td><td>{date(row.settledAt)}</td></tr>)}</tbody></Table> : null}
    {view === 'assets' && assets ? <Table><thead><tr><th>Asset</th><th>Rules</th><th>Market</th><th>Price</th><th>Asset</th><th>Market status</th></tr></thead><tbody>{assets.map((asset) => { const market = asset.markets[0]; return <tr key={asset.id}><td><strong>{asset.symbol}</strong><small>{asset.name} · {asset.type}</small></td><td><small>{asset.rules.minAmount}–{asset.rules.maxAmount} · {(Number(asset.rules.payoutRate) * 100).toFixed(1)}%</small></td><td>{market?.externalSymbol ?? '—'}</td><td>{market?.lastPrice ?? '—'}</td><td><button className={asset.isActive ? 'tag tag--good' : 'tag'} onClick={async () => { try { const next = await adminApi.assetStatus(asset.id, !asset.isActive); setAssets((items) => items?.map((item) => item.id === asset.id ? { ...item, isActive: next.isActive } : item) ?? null) } catch (err) { setError(err instanceof Error ? err.message : 'Could not change asset status') } }}>{asset.isActive ? 'ACTIVE' : 'DISABLED'}</button></td><td>{market ? <select value={market.status} onChange={async (e) => { try { await adminApi.marketStatus(market.id, e.target.value); setAssets((items) => items?.map((item) => item.id === asset.id ? { ...item, markets: item.markets.map((m) => m.id === market.id ? { ...m, status: e.target.value } : m) } : item) ?? null) } catch (err) { setError(err instanceof Error ? err.message : 'Could not change market status') } }}><option>OPEN</option><option>CLOSED</option><option>HALTED</option><option>MAINTENANCE</option></select> : '—'}</td></tr> })}</tbody></Table> : null}
    {!trades && !positions && !settlements && !assets ? <div className="loading-card"><Activity className="spin" size={20} /> Loading trading data…</div> : null}
  </section></div>
}

function FinancePage({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<FinanceView>('wallets')
  const [wallets, setWallets] = useState<List<WalletRecord> | null>(null)
  const [deposits, setDeposits] = useState<List<FundingRecord> | null>(null)
  const [withdrawals, setWithdrawals] = useState<List<FundingRecord> | null>(null)
  const [reviewQueue, setReviewQueue] = useState<List<PaymentWithdrawalReviewRecord> | null>(null)
  const [processingQueue, setProcessingQueue] = useState<List<PaymentWithdrawalReviewRecord> | null>(null)
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  const [ledger, setLedger] = useState<List<LedgerRecord> | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busyWithdrawalId, setBusyWithdrawalId] = useState<string | null>(null)
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})

  async function load() {
    setError('')
    try {
      const [w, d, wd, queue, processing, r, l] = await Promise.all([
        adminApi.wallets(),
        adminApi.deposits(),
        adminApi.withdrawals(),
        adminApi.paymentWithdrawalQueue('PENDING'),
        adminApi.paymentWithdrawalQueue('PROCESSING'),
        adminApi.reconciliation(),
        adminApi.ledger(),
      ])
      setWallets(w)
      setDeposits(d)
      setWithdrawals(wd)
      setReviewQueue(queue)
      setProcessingQueue(processing)
      setRecon(r)
      setLedger(l)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load finance data')
    }
  }

  useEffect(() => { void load() }, [refreshKey])

  async function approveWithdrawal(row: PaymentWithdrawalReviewRecord) {
    if (busyWithdrawalId) return
    setBusyWithdrawalId(row.id)
    setActionError('')
    setActionMessage('')
    try {
      await adminApi.approvePaymentWithdrawal(row.id)
      await load()
      setActionMessage('Withdrawal ' + row.id.slice(0, 8) + ' approved and handed to the configured provider.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not approve this withdrawal.')
    } finally {
      setBusyWithdrawalId(null)
    }
  }

  async function rejectWithdrawal(row: PaymentWithdrawalReviewRecord) {
    if (busyWithdrawalId) return
    const reason = (rejectionReasons[row.id] ?? '').trim()
    if (reason.length < 3) {
      setActionError('Enter a rejection reason of at least 3 characters.')
      setActionMessage('')
      return
    }
    setBusyWithdrawalId(row.id)
    setActionError('')
    setActionMessage('')
    try {
      await adminApi.rejectPaymentWithdrawal(row.id, reason)
      await load()
      setRejectionReasons((current) => ({ ...current, [row.id]: '' }))
      setActionMessage('Withdrawal ' + row.id.slice(0, 8) + ' rejected. The held amount has been returned to the customer wallet.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reject this withdrawal.')
    } finally {
      setBusyWithdrawalId(null)
    }
  }

  async function reconcileWithdrawal(row: PaymentWithdrawalReviewRecord) {
    if (busyWithdrawalId) return
    setBusyWithdrawalId(row.id)
    setActionError('')
    setActionMessage('')
    try {
      const result = await adminApi.reconcilePaymentWithdrawal(row.id)
      await load()
      const status = result.providerStatus
      const finalStatus = result.withdrawal.status
      setActionMessage(finalStatus === 'COMPLETED'
        ? 'Withdrawal ' + row.id.slice(0, 8) + ' is completed.'
        : finalStatus === 'FAILED'
          ? 'Withdrawal ' + row.id.slice(0, 8) + ' failed; the reserved amount was refunded.'
          : 'Provider still reports ' + status.toLowerCase() + '. No wallet or ledger change was made.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reconcile this withdrawal.')
    } finally {
      setBusyWithdrawalId(null)
    }
  }

  const views: Array<{ id: FinanceView; label: string }> = [
    { id: 'wallets', label: 'Wallets' },
    { id: 'deposits', label: 'Deposits' },
    { id: 'withdrawals', label: 'Withdrawals' },
    { id: 'withdrawal-review', label: 'Withdrawal review' },
    { id: 'payout-reconciliation', label: 'Payout reconciliation' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'ledger', label: 'Ledger' },
  ]

  return <div className="page">
    <section className="toolbar-panel tab-row">
      {views.map((item) => <button key={item.id} className={view === item.id ? 'tab tab--active' : 'tab'} onClick={() => setView(item.id)}>{item.label}</button>)}
      <span className="toolbar-spacer" />
      <button className="button button--ghost button--small" type="button" onClick={() => void load()}><RefreshCw size={13} /> Refresh</button>
    </section>
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {actionError ? <div className="notice notice--error" role="alert"><AlertTriangle size={15} /><span>{actionError}</span></div> : null}
    {actionMessage ? <div className="notice" role="status"><CheckCircle2 size={15} /><span>{actionMessage}</span></div> : null}
    <section className="panel">
      {view === 'wallets' && wallets ? <Table><thead><tr><th>User</th><th>Mode</th><th>Wallet</th><th>Available</th><th>Held</th><th>Status</th></tr></thead><tbody>{wallets.items.map((w) => <tr key={w.id}><td>{w.account.user.email}</td><td><span className="tag">{w.account.mode}</span></td><td>{w.currency}</td><td>{amount(w.availableBalance)}</td><td>{amount(w.heldBalance)}</td><td><span className={tagClass(w.status)}>{w.status}</span></td></tr>)}</tbody></Table> : null}
      {view === 'deposits' && deposits ? <FundingTable rows={deposits.items} /> : null}
      {view === 'withdrawals' && withdrawals ? <FundingTable rows={withdrawals.items} withdrawal /> : null}
      {view === 'payout-reconciliation' && processingQueue ? (
        <>
          <div className="panel-heading"><div><span className="eyebrow">Operations</span><h2>Processing payouts</h2><small>Check the original provider’s status before closing or refunding a payout whose final result is uncertain. If the provider is unreachable, funds remain reserved.</small></div><span className={processingQueue.items.length ? 'tag tag--bad' : 'tag tag--good'}>{processingQueue.items.length} PROCESSING</span></div>
          {processingQueue.items.length ? (
            <Table>
              <thead><tr><th>Request</th><th>Customer</th><th>Amount</th><th>Destination</th><th>Updated</th><th>Provider check</th></tr></thead>
              <tbody>{processingQueue.items.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.id.slice(0, 8)}</strong><small>{row.provider} · {row.id}</small></td>
                  <td><strong>{row.user.legalName || 'Name not supplied'}</strong><small>{row.user.email}</small></td>
                  <td><strong>{amount(row.amount)} {row.currency}</strong></td>
                  <td>{row.destination ?? '—'}</td>
                  <td>{date(row.requestedAt)}</td>
                  <td>
                    <button className="button button--ghost button--small" type="button" disabled={busyWithdrawalId !== null} onClick={() => void reconcileWithdrawal(row)}>
                      {busyWithdrawalId === row.id ? 'Checking…' : 'Check provider status'}
                    </button>
                    {row.failureReason ? <small>{row.failureReason}</small> : null}
                  </td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <div className="empty-state"><CheckCircle2 size={24} /><strong>No payouts are currently processing.</strong><span>Requests awaiting a provider result will appear here.</span></div>}
        </>
      ) : null}
      {view === 'withdrawal-review' && reviewQueue ? (
        <>
          <div className="panel-heading"><div><span className="eyebrow">Finance controls</span><h2>Pending withdrawal review</h2><small>Approve only after checking the account, destination and request. Rejections return held funds to the customer wallet.</small></div><span className={reviewQueue.items.length ? 'tag tag--bad' : 'tag tag--good'}>{reviewQueue.items.length} PENDING</span></div>
          {reviewQueue.items.length ? (
            <Table>
              <thead><tr><th>Request</th><th>Customer</th><th>Amount</th><th>Destination</th><th>Requested</th><th>Decision</th></tr></thead>
              <tbody>{reviewQueue.items.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.id.slice(0, 8)}</strong><small>{row.provider} · {row.id}</small></td>
                  <td><strong>{row.user.legalName || 'Name not supplied'}</strong><small>{row.user.email} · {row.user.countryCode ?? 'Country missing'}</small></td>
                  <td><strong>{amount(row.amount)} {row.currency}</strong></td>
                  <td>{row.destination ?? '—'}</td>
                  <td>{date(row.requestedAt)}</td>
                  <td>
                    <div className="withdrawal-review-actions">
                      <button className="button button--primary button--small" type="button" disabled={busyWithdrawalId !== null} onClick={() => void approveWithdrawal(row)}>{busyWithdrawalId === row.id ? 'Processing…' : 'Approve'}</button>
                      <input
                        className="withdrawal-reason-input"
                        aria-label={'Rejection reason for withdrawal ' + row.id.slice(0, 8)}
                        value={rejectionReasons[row.id] ?? ''}
                        maxLength={255}
                        placeholder="Reason required"
                        onChange={(event) => setRejectionReasons((current) => ({ ...current, [row.id]: event.target.value }))}
                        disabled={busyWithdrawalId !== null}
                      />
                      <button className="button button--danger button--small" type="button" disabled={busyWithdrawalId !== null || (rejectionReasons[row.id] ?? '').trim().length < 3} onClick={() => void rejectWithdrawal(row)}>{busyWithdrawalId === row.id ? 'Processing…' : 'Reject & refund'}</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <div className="empty-state"><CheckCircle2 size={24} /><strong>No withdrawals are waiting for review.</strong><span>New requests requiring manual approval will appear here.</span></div>}
        </>
      ) : null}
      {view === 'reconciliation' && recon ? <ReconciliationView data={recon} /> : null}
      {view === 'ledger' && ledger ? <Table><thead><tr><th>Transaction</th><th>Reference</th><th>Entries</th><th>Created</th></tr></thead><tbody>{ledger.items.map((row) => <tr key={row.id}><td><strong>{row.id.slice(0, 8)}</strong><small>{row.currency}</small></td><td>{row.referenceType ?? '—'} {row.referenceId ?? ''}</td><td><div className="entry-stack">{row.entries.map((entry, i) => <span key={i} className={entry.direction === 'CREDIT' ? 'text-positive' : 'text-negative'}>{entry.direction} {amount(entry.amount)} · {entry.ledgerAccount.code}</span>)}</div></td><td>{date(row.createdAt)}</td></tr>)}</tbody></Table> : null}
      {!wallets && !deposits && !withdrawals && !reviewQueue && !processingQueue && !recon && !ledger ? <div className="loading-card"><Activity className="spin" size={20} /> Loading finance data…</div> : null}
    </section>
  </div>
}

function FundingTable({ rows, withdrawal = false }: { rows: FundingRecord[]; withdrawal?: boolean }) {
  return <Table><thead><tr><th>Request</th><th>User</th><th>Amount</th><th>Provider</th><th>Mode</th><th>Status</th><th>Requested</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.id.slice(0, 8)}</strong><small>{withdrawal ? row.wallet.id.slice(0, 8) : row.providerReference ?? 'No provider ref'}</small></td><td>{row.wallet.account.user.email}</td><td>{amount(row.amount)} {row.currency}</td><td>{row.provider}</td><td>{row.wallet.account.mode}</td><td><span className={tagClass(row.status)}>{row.status}</span></td><td>{date(row.requestedAt)}</td></tr>)}</tbody></Table>
}

function ReconciliationView({ data }: { data: Reconciliation }) {
  return <div className="recon-card"><div className={data.unbalanced.length === 0 ? 'recon-status recon-status--good' : 'recon-status recon-status--bad'}>{data.unbalanced.length === 0 ? <CheckCircle2 size={26} /> : <AlertTriangle size={26} />}<div><strong>{data.unbalanced.length === 0 ? 'Ledger balanced' : 'Unbalanced transactions found'}</strong><span>{data.balanced} of {data.scanned} scanned transactions balanced</span></div></div>{data.unbalanced.length ? <Table><thead><tr><th>Transaction</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Created</th></tr></thead><tbody>{data.unbalanced.map((row) => <tr key={row.id}><td>{row.id.slice(0, 8)}</td><td>{row.referenceType ?? '—'} {row.referenceId ?? ''}</td><td>{amount(row.debit)}</td><td>{amount(row.credit)}</td><td>{date(row.createdAt)}</td></tr>)}</tbody></Table> : null}</div>
}

function SupportPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<List<SupportTicketRecord> | null>(null)
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null)
  const [status, setStatus] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const q = new URLSearchParams({ page: '1', pageSize: '50' })
      if (status) q.set('status', status)
      setData(await adminApi.supportTickets('?' + q.toString()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load support tickets')
    }
  }

  useEffect(() => { void load() }, [refreshKey, status])

  async function openTicket(id: string) {
    setError('')
    try {
      setDetail(await adminApi.supportTicket(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load support ticket')
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault()
    if (!detail || !reply.trim()) return
    setBusy(true)
    setError('')
    try {
      setDetail(await adminApi.replySupport(detail.id, reply))
      setReply('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send support reply')
    } finally {
      setBusy(false)
    }
  }

  async function closeTicket() {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      setDetail(await adminApi.closeSupport(detail.id))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close support ticket')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page">
    <section className="toolbar-panel">
      <div className="filter-row">
        <label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All tickets</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="WAITING_USER">Waiting user</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label>
        <button type="button" className="button button--primary" onClick={() => void load()}>Refresh</button>
      </div>
    </section>
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    <section className={detail ? 'support-layout support-layout--open' : 'support-layout'}>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Customer support</span><h2>{data?.pagination.total.toLocaleString() ?? '—'} tickets</h2></div></div>
        {data ? <Table><thead><tr><th>Ticket</th><th>User</th><th>Category</th><th>Status</th><th>Messages</th><th>Updated</th></tr></thead><tbody>
          {data.items.map((ticket) => <tr key={ticket.id} className="click-row" tabIndex={0} role="button" onClick={() => void openTicket(ticket.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTicket(ticket.id) } }}>
            <td><strong>{ticket.subject}</strong><small>{ticket.id.slice(0, 8)}</small></td><td>{ticket.user.email}</td><td>{ticket.category}</td><td><span className={tagClass(ticket.status)}>{ticket.status}</span></td><td>{ticket.messageCount}</td><td>{date(ticket.updatedAt)}</td>
          </tr>)}
        </tbody></Table> : <div className="loading-card"><Activity className="spin" size={20} /> Loading support tickets…</div>}
        {data?.items.length === 0 ? <div className="empty-state">No tickets match this filter.</div> : null}
      </article>

      {detail ? <aside className="panel detail-panel">
        <div className="panel-heading"><div><span className="eyebrow">{detail.category} · {detail.user.email}</span><h2>{detail.subject}</h2></div><button type="button" className="icon-button" onClick={() => setDetail(null)} aria-label="Close ticket details">×</button></div>
        <div className="support-thread">
          {detail.messages.map((message) => <article className="support-message" key={message.id}><div><strong>{message.author.displayName || (message.author.admin ? 'SL Spot Support' : message.author.email)}</strong><small>{date(message.createdAt)}</small></div><p>{message.body}</p></article>)}
        </div>
        {detail.status === 'CLOSED' ? <div className="notice">This ticket is closed.</div> : <form onSubmit={(event) => void sendReply(event)}>
          <label className="field"><span>Reply to customer</span><textarea rows={7} maxLength={10000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a support response…" /></label>
          <div className="action-row"><button className="button button--primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button><button type="button" className="button button--ghost" disabled={busy} onClick={() => void closeTicket()}>Close ticket</button></div>
        </form>}
      </aside> : null}
    </section>
  </div>
}

function AnnouncementsPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<List<AnnouncementRecord> | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setData(await adminApi.announcements('?page=1&pageSize=50'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load announcements')
    }
  }

  useEffect(() => { void load() }, [refreshKey])

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminApi.createAnnouncement(title, body)
      setTitle('')
      setBody('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create announcement')
    } finally {
      setBusy(false)
    }
  }

  async function publish(id: string) {
    setBusy(true)
    setError('')
    try {
      await adminApi.publishAnnouncement(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish announcement')
    } finally {
      setBusy(false)
    }
  }

  async function archive(id: string) {
    setBusy(true)
    setError('')
    try {
      await adminApi.archiveAnnouncement(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive announcement')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page">
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">System messaging</span><h2>Create announcement</h2></div></div>
      <form className="announcement-form" onSubmit={(event) => void create(event)}>
        <label className="field"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Scheduled maintenance" /></label>
        <label className="field"><span>Message</span><textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} required placeholder="Tell users what they need to know." /></label>
        <button className="button button--primary" disabled={busy || !title.trim() || !body.trim()}>{busy ? 'Saving…' : 'Save draft'}</button>
      </form>
    </section>
    <section className="panel announcement-table">
      <div className="panel-heading"><div><span className="eyebrow">Announcements</span><h2>Publication history</h2></div></div>
      {data ? <Table><thead><tr><th>Announcement</th><th>Status</th><th>Recipients</th><th>Created</th><th>Published</th><th /></tr></thead><tbody>
        {data.items.map((item) => <tr key={item.id}>
          <td><strong>{item.title}</strong><small>{item.body}</small></td>
          <td><span className={tagClass(item.status)}>{item.status}</span></td>
          <td>{item._count.notifications}</td>
          <td>{date(item.createdAt)}</td>
          <td>{date(item.publishedAt)}</td>
          <td><div className="action-row">{item.status === 'DRAFT' ? <button type="button" className="button button--primary button--small" disabled={busy} onClick={() => void publish(item.id)}>Publish</button> : null}{item.status !== 'ARCHIVED' ? <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void archive(item.id)}>Archive</button> : null}</div></td>
        </tr>)}
      </tbody></Table> : <div className="loading-card"><Activity className="spin" size={20} /> Loading announcements…</div>}
      {data?.items.length === 0 ? <div className="empty-state">No announcements yet.</div> : null}
    </section>
  </div>
}

function LaunchGatePage({ refreshKey, role }: { refreshKey: number; role: string }) {
  const [data, setData] = useState<RealMoneyGateStatus | null>(null)
  const [draft, setDraft] = useState<RealMoneyGateSettings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const result = await adminApi.realMoneyGate()
      setData(result)
      setDraft(result.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load real-money launch controls')
    }
  }

  useEffect(() => { void load() }, [refreshKey])

  const changed = Boolean(data && draft && (
    data.settings.tradingEnabled !== draft.tradingEnabled ||
    data.settings.depositsEnabled !== draft.depositsEnabled ||
    data.settings.withdrawalsEnabled !== draft.withdrawalsEnabled
  ))
  const deploymentAllowsTrading = Boolean(data?.environment.launchApproved && data.environment.tradingEnabled)
  const canEnableTrading = deploymentAllowsTrading && role === 'SUPER_ADMIN'
  const tradingEnabled = Boolean(data?.effective.tradingEnabled)

  async function save() {
    if (!draft || !data || !changed) return
    if (draft.tradingEnabled && !data.settings.tradingEnabled) {
      const approved = window.confirm(
        'Enable the database REAL-trading switch? The master launch-approval flag and REAL_TRADING_ENABLED environment flag must also be true. Confirm that the remaining launch checks have been completed before enabling real-money trading.',
      )
      if (!approved) return
    }
    setBusy(true)
    setError('')
    try {
      const result = await adminApi.updateRealMoneyGate(draft)
      setData(result)
      setDraft(result.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update real-money launch controls')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page">
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {!data || !draft ? <div className="loading-card"><Activity className="spin" size={20} /> Loading real-money launch controls…</div> : <>
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Deployment + database controls</span><h2>Real-money launch gate</h2><small>Both locks must allow an operation before it can proceed.</small></div>
          <span className={tradingEnabled ? 'tag tag--good' : 'tag tag--bad'}>{tradingEnabled ? 'REAL TRADING ENABLED' : 'REAL TRADING BLOCKED'}</span>
        </div>
        <div className="launch-gate-environment">
          <div><strong>Master launch approval</strong><small><span className={data.environment.launchApproved ? 'tag tag--good' : 'tag tag--bad'}>{data.environment.launchApproved ? 'ENABLED' : 'BLOCKED'}</span></small><small>REAL_MONEY_LAUNCH_APPROVED</small></div>
          <div><strong>Environment trading flag</strong><small><span className={data.environment.tradingEnabled ? 'tag tag--good' : 'tag tag--bad'}>{data.environment.tradingEnabled ? 'ENABLED' : 'BLOCKED'}</span></small><small>REAL_TRADING_ENABLED</small></div>
          <div><strong>Environment deposit flag</strong><small><span className={data.environment.depositsEnabled ? 'tag tag--good' : 'tag tag--bad'}>{data.environment.depositsEnabled ? 'ENABLED' : 'BLOCKED'}</span></small><small>REAL_DEPOSITS_ENABLED</small></div>
          <div><strong>Environment withdrawal flag</strong><small><span className={data.environment.withdrawalsEnabled ? 'tag tag--good' : 'tag tag--bad'}>{data.environment.withdrawalsEnabled ? 'ENABLED' : 'BLOCKED'}</span></small><small>REAL_WITHDRAWALS_ENABLED</small></div>
        </div>
        <div className="launch-gate-row">
          <div className="launch-gate-info">
            <strong>REAL trading database switch</strong>
            <p>This is the runtime switch stored in MySQL. Only a SUPER_ADMIN can turn it on, and it cannot override either environment lock. Any administrator can turn it off. Turning it off blocks new REAL trades; existing trades can still settle or recover so customer funds are not stranded.</p>
            <span className={draft.tradingEnabled ? 'tag tag--good' : 'tag tag--bad'}>{draft.tradingEnabled ? 'ADMIN SWITCH ON' : 'ADMIN SWITCH OFF'}</span>
          </div>
          <label className="launch-gate-toggle">Allow new REAL trades
            <input
              type="checkbox"
              checked={draft.tradingEnabled}
              disabled={busy || (!draft.tradingEnabled && !canEnableTrading)}
              onChange={(event) => setDraft((current) => current ? { ...current, tradingEnabled: event.target.checked } : current)}
            />
          </label>
        </div>
        {!deploymentAllowsTrading ? <div className="notice"><ShieldCheck size={17} /><span>The deployment launch gate is closed. The admin switch cannot enable REAL trading until both required environment flags are configured and the backend is restarted.</span></div> : role !== 'SUPER_ADMIN' ? <div className="notice"><ShieldCheck size={17} /><span>Only a SUPER_ADMIN can enable REAL trading. Any administrator can switch it off in an emergency.</span></div> : null}
        <div className="action-row">
          <button type="button" className="button button--primary" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save audited changes'}</button>
          <button type="button" className="button button--ghost" disabled={busy || !changed} onClick={() => setDraft(data.settings)}>Discard changes</button>
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => void load()}>Refresh status</button>
        </div>
        <div className="subsection"><span className="eyebrow">Last change</span><span>{data.updatedAt ? date(data.updatedAt) : 'No database switch changes recorded yet'}</span><p className="muted-label">Every persisted setting change is recorded in the admin audit log.</p></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Payment integration pending</span><h2>Real deposits and withdrawals</h2></div><span className="tag tag--bad">BLOCKED</span></div>
        <div className="launch-gate-row">
          <div className="launch-gate-info"><strong>Deposits</strong><p>Disabled until provider-backed deposit intents, signed webhook verification, idempotency, refunds and ledger reconciliation are implemented.</p></div>
          <span className="tag tag--bad">NOT AVAILABLE</span>
        </div>
        <div className="launch-gate-row">
          <div className="launch-gate-info"><strong>Withdrawals</strong><p>Disabled until eligibility checks, destination verification, approval controls, provider transfers and failure recovery are implemented.</p></div>
          <span className="tag tag--bad">NOT AVAILABLE</span>
        </div>
      </section>
    </>}
  </div>
}

function RiskPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<RiskSummary | null>(null)
  const [error, setError] = useState('')
  async function load() { setError(''); try { setData(await adminApi.risk()) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load risk summary') } }
  useEffect(() => { void load() }, [refreshKey])
  return <div className="page">{error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}{data ? <><section className="metrics-grid"><Metric label="Open positions" value={String(data.exposure.openPositions)} detail={'Limit ' + data.limits.maxOpenPositions} /><Metric label="Open exposure" value={amount(data.exposure.total)} detail={'Limit ' + amount(data.limits.maxOpenExposure)} /><Metric label="Pending orders" value={String(data.monitoring.pendingOrders)} detail="Awaiting processing" /><Metric label="Rejected / 24h" value={String(data.monitoring.rejectedOrders24h)} detail="Rejected order count" /></section><section className="panel-grid"><article className="panel"><div className="panel-heading"><div><span className="eyebrow">Exposure</span><h2>By asset</h2></div></div><div className="risk-bars">{data.exposure.byAsset.map((row) => <div className="risk-row" key={row.symbol}><div><strong>{row.symbol}</strong><span>{amount(row.amount)}</span></div><div className="risk-track"><span style={{ width: Math.min(100, (Number(row.amount) / Math.max(1, Number(data.limits.maxOpenExposure))) * 100) + '%' }} /></div></div>)}{data.exposure.byAsset.length === 0 ? <div className="empty-state">No open exposure.</div> : null}</div></article><article className="panel"><div className="panel-heading"><div><span className="eyebrow">Risk rules</span><h2>Configured limits</h2></div></div><div className="rule-list"><div><span>Max open positions</span><strong>{data.limits.maxOpenPositions}</strong></div><div><span>Max open exposure</span><strong>{data.limits.maxOpenExposure}</strong></div><div><span>Market max age</span><strong>{Math.round(data.limits.marketMaxAgeMs / 1000)}s</strong></div><div><span>Fee rate</span><strong>{data.limits.feeRate}</strong></div></div></article></section></> : <div className="loading-card"><Activity className="spin" size={20} /> Loading risk summary…</div>}</div>
}

function AuditPage({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<'logs' | 'security'>('logs')
  const [logs, setLogs] = useState<List<AuditRecord> | null>(null)
  const [security, setSecurity] = useState<List<AuditRecord> | null>(null)
  const [error, setError] = useState('')
  async function load() { setError(''); try { const [a, s] = await Promise.all([adminApi.audit(), adminApi.security()]); setLogs(a); setSecurity(s) } catch (err) { setError(err instanceof Error ? err.message : 'Could not load audit data') } }
  useEffect(() => { void load() }, [refreshKey])
  async function exportAudit() { try { const rows = await adminApi.exportAudit(); const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'slspot-audit-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url) } catch (err) { setError(err instanceof Error ? err.message : 'Could not export audit logs') } }
  const rows = view === 'logs' ? logs : security
  return <div className="page"><section className="toolbar-panel tab-row"><button className={view === 'logs' ? 'tab tab--active' : 'tab'} onClick={() => setView('logs')}>Audit logs</button><button className={view === 'security' ? 'tab tab--active' : 'tab'} onClick={() => setView('security')}>Security events</button><span className="toolbar-spacer" /><button className="button button--ghost" onClick={() => void exportAudit()}><Download size={15} /> Export JSON</button></section>{error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}<section className="panel">{rows ? <Table><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>IP</th><th>Created</th></tr></thead><tbody>{rows.items.map((row) => <tr key={row.id}><td><strong>{row.action}</strong><small>{row.id.slice(0, 8)}</small></td><td>{row.entityType}<small>{row.entityId ?? '—'}</small></td><td>{row.actorUser?.email ?? 'System'}</td><td>{row.ipAddress ?? '—'}</td><td>{date(row.createdAt)}</td></tr>)}</tbody></Table> : <div className="loading-card"><Activity className="spin" size={20} /> Loading audit data…</div>}</section></div>
}

export default App
