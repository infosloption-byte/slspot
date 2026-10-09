export class AdminApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
const baseUrl = (env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

let csrfToken: string | null = null
let csrfFetchPromise: Promise<string | null> | null = null

function extractCsrfToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const token = (data as { csrfToken?: unknown }).csrfToken
  return typeof token === 'string' && token.length > 0 ? token : null
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  if (csrfFetchPromise) {
    const pending = await csrfFetchPromise
    if (!pending) throw new AdminApiError(403, 'CSRF protection token is unavailable', 'CSRF_UNAVAILABLE')
    return pending
  }

  csrfFetchPromise = (async () => {
    try {
      const response = await fetch(baseUrl + '/auth/csrf', {
        credentials: 'include',
        headers: { Accept: 'application/json', 'x-request-id': crypto.randomUUID() },
      })
      const body = await response.json().catch(() => null)
      csrfToken = response.ok ? extractCsrfToken(body) : null
      return csrfToken
    } finally {
      csrfFetchPromise = null
    }
  })()

  const token = await csrfFetchPromise
  if (!token) throw new AdminApiError(403, 'CSRF protection token is unavailable', 'CSRF_UNAVAILABLE')
  return token
}

async function request<T>(path: string, init: RequestInit = {}, csrfRetry = false): Promise<T> {
  const method = String(init.method ?? 'GET').toUpperCase()
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (unsafe) await ensureCsrfToken()

  const response = await fetch(baseUrl + (path.startsWith('/') ? path : '/' + path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(unsafe && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      'x-request-id': crypto.randomUUID(),
      ...init.headers,
    },
  })

  const body = await response.json().catch(() => null) as {
    success?: boolean
    data?: T & { csrfToken?: string }
    error?: { code?: string; message?: string }
  } | null

  if (!response.ok || body?.success === false) {
    if (unsafe && body?.error?.code === 'CSRF_INVALID' && !csrfRetry) {
      csrfToken = null
      const refreshed = await ensureCsrfToken()
      return request<T>(path, { ...init, headers: { ...init.headers, 'x-csrf-token': refreshed } }, true)
    }
    throw new AdminApiError(response.status, body?.error?.message || 'Request failed', body?.error?.code)
  }

  const responseCsrfToken = extractCsrfToken(body)
  if (responseCsrfToken) csrfToken = responseCsrfToken
  return body?.data as T
}

export type LoginResult = {
  requiresTwoFactor: boolean
  user?: { id: string; email: string; status: string }
  challengeToken?: string
  challengeExpiresAt?: string
  expiresAt?: string
  csrfToken?: string
}

export const adminApi = {
  login: (email: string, password: string) => request<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, rememberDevice: false }) }),
  verify2fa: (challengeToken: string, code: string) => request<LoginResult>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challengeToken, code, rememberDevice: false }) }),
  logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ id: string; email: string; role: 'ADMIN' | 'SUPER_ADMIN' }>('/admin/me'),
  dashboard: () => request<Dashboard>('/admin/dashboard'),
  users: (params = '') => request<List<UserRecord>>('/admin/users' + params),
  user: (id: string) => request<UserDetail>('/admin/users/' + encodeURIComponent(id)),
  setUserStatus: (id: string, status: string) => request<UserRecord>('/admin/users/' + id + '/status', { method: 'POST', body: JSON.stringify({ status }) }),
  revokeSessions: (id: string) => request<{ revoked: number }>('/admin/users/' + id + '/revoke-sessions', { method: 'POST' }),
  trades: () => request<List<TradeRecord>>('/admin/trades'),
  positions: () => request<List<PositionRecord>>('/admin/positions'),
  settlements: () => request<List<SettlementRecord>>('/admin/settlements'),
  assets: () => request<AssetRecord[]>('/admin/assets'),
  assetStatus: (id: string, isActive: boolean) => request<{ id: string; symbol: string; isActive: boolean }>('/admin/assets/' + id + '/status', { method: 'POST', body: JSON.stringify({ isActive }) }),
  marketStatus: (id: string, status: string) => request<{ id: string; status: string }>('/admin/markets/' + id + '/status', { method: 'POST', body: JSON.stringify({ status }) }),
  wallets: () => request<List<WalletRecord>>('/admin/wallets'),
  deposits: () => request<List<FundingRecord>>('/admin/deposits'),
  withdrawals: () => request<List<FundingRecord>>('/admin/withdrawals'),
  reconciliation: () => request<Reconciliation>('/admin/finance/reconciliation'),
  ledger: () => request<List<LedgerRecord>>('/admin/ledger'),
  realMoneyGate: () => request<RealMoneyGateStatus>('/admin/real-money-gate'),
  updateRealMoneyGate: (settings: RealMoneyGateSettings) => request<RealMoneyGateStatus>('/admin/real-money-gate', { method: 'PUT', body: JSON.stringify(settings) }),
  risk: () => request<RiskSummary>('/admin/risk'),
  audit: () => request<List<AuditRecord>>('/admin/audit'),
  supportTickets: (params = '') => request<List<SupportTicketRecord>>('/admin/support/tickets' + params),
  supportTicket: (id: string) => request<SupportTicketDetail>('/admin/support/tickets/' + encodeURIComponent(id)),
  replySupport: (id: string, body: string) => request<SupportTicketDetail>('/admin/support/tickets/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: JSON.stringify({ body }) }),
  closeSupport: (id: string) => request<SupportTicketDetail>('/admin/support/tickets/' + encodeURIComponent(id) + '/close', { method: 'POST' }),
  announcements: (params = '') => request<List<AnnouncementRecord>>('/admin/announcements' + params),
  createAnnouncement: (title: string, body: string) => request<AnnouncementRecord>('/admin/announcements', { method: 'POST', body: JSON.stringify({ title, body }) }),
  publishAnnouncement: (id: string) => request<{ id: string; title: string; body: string; recipientCount: number }>('/admin/announcements/' + encodeURIComponent(id) + '/publish', { method: 'POST' }),
  archiveAnnouncement: (id: string) => request<{ archived: boolean }>('/admin/announcements/' + encodeURIComponent(id) + '/archive', { method: 'POST' }),
  security: () => request<List<AuditRecord>>('/admin/security-events'),
  exportAudit: () => request<AuditRecord[]>('/admin/export/audit'),
}

export type SupportTicketRecord = {
  id: string
  subject: string
  category: 'ACCOUNT' | 'TRADING' | 'WALLET' | 'TECHNICAL' | 'OTHER'
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messageCount: number
  user: { id: string; email: string }
  lastMessage: { body: string; createdAt: string; authorEmail: string; authorIsAdmin: boolean } | null
}
export type SupportMessageRecord = {
  id: string
  body: string
  createdAt: string
  author: { id: string; displayName: string | null; email: string; admin: boolean }
}
export type SupportTicketDetail = {
  id: string
  subject: string
  category: SupportTicketRecord['category']
  status: SupportTicketRecord['status']
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  user: { id: string; email: string }
  messages: SupportMessageRecord[]
}
export type AnnouncementRecord = {
  id: string
  title: string
  body: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdByUserId: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: { email: string }
  _count: { notifications: number }
}

export type List<T> = { items: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export type Dashboard = {
  metrics: { users: number; activeUsers: number; deposits: { count: number; amount: string }; withdrawals: { count: number; amount: string }; openTrades: number; volume24h: string; openExposure: string }
  systemHealth: { database: string; redis: string }
  timestamp: string
}
export type UserRecord = { id: string; email: string; status: string; countryCode: string | null; createdAt: string; lastLoginAt: string | null; emailVerifiedAt: string | null; twoFactorEnabled: boolean; adminAccess: { role: string } | null; kycStatus: string; _count: { sessions: number; accounts: number; trades: number } }
export type UserDetail = UserRecord & {
  updatedAt: string
  termsAcceptedAt: string | null
  termsVersion: string | null
  accounts: Array<{ id: string; name: string; currency: string; mode: string; status: string; createdAt: string; wallets: Array<{ id: string; currency: string; status: string; availableBalance: string; heldBalance: string }> }>
  kycCases: Array<{ id: string; provider: string | null; providerCaseId: string | null; status: string; submittedAt: string | null; resolvedAt: string | null; createdAt: string; updatedAt: string }>
  sessions: Array<{ id: string; deviceId: string | null; ipAddress: string | null; userAgent: string | null; createdAt: string; updatedAt: string; expiresAt: string; revokedAt: string | null }>
}
export type TradeRecord = { id: string; status: string; grossPnl: string | null; fee: string; netPnl: string | null; openedAt: string; closedAt: string | null; user: { id: string; email: string }; position: { id: string; side: string; amount: string; entryPrice: string; exitPrice: string | null; asset: { symbol: string; name: string }; order: { durationSeconds: number | null; payoutRate: string; expiresAt: string | null } } }
export type PositionRecord = { id: string; status: string; side: string; amount: string; entryPrice: string; exitPrice: string | null; openedAt: string; closedAt: string | null; user: { email: string }; asset: { symbol: string; name: string } }
export type SettlementRecord = { id: string; status: string; settlementPrice: string | null; grossPayout: string | null; fees: string; netPnl: string | null; referenceId: string | null; settledAt: string | null; createdAt: string; trade: { id: string; status: string; user: { email: string }; position: { asset: { symbol: string } } } }
export type AssetRecord = { id: string; symbol: string; name: string; type: string; isActive: boolean; sortOrder: number; quoteCurrency: string | null; rules: { enabled: boolean; payoutRate: string; minAmount: string; maxAmount: string; durationsSeconds: number[]; feeRate: string }; markets: Array<{ id: string; provider: string; externalSymbol: string; status: string; lastPrice: string | null; lastChangePct: string | null; lastVolume: string | null }> }
export type WalletRecord = { id: string; currency: string; status: string; availableBalance: string; heldBalance: string; totalBalance: string; updatedAt: string; account: { id: string; name: string; mode: string; user: { id: string; email: string } } }
export type FundingRecord = { id: string; provider: string; providerReference: string | null; amount: string; currency: string; status: string; failureReason: string | null; requestedAt: string; completedAt: string | null; wallet: { id: string; account: { mode: string; user: { email: string } } } }
export type Reconciliation = { scanned: number; balanced: number; unbalanced: Array<{ id: string; currency: string; referenceType: string | null; referenceId: string | null; description: string | null; createdAt: string; balanced: boolean; debit: string; credit: string }> }
export type LedgerRecord = { id: string; currency: string; referenceType: string | null; referenceId: string | null; description: string | null; createdAt: string; entries: Array<{ direction: string; amount: string; ledgerAccount: { code: string; name: string } }> }
export type RealMoneyGateSettings = {
  tradingEnabled: boolean
  depositsEnabled: boolean
  withdrawalsEnabled: boolean
}
export type RealMoneyGateStatus = {
  settings: RealMoneyGateSettings
  environment: {
    launchApproved: boolean
    tradingEnabled: boolean
    depositsEnabled: boolean
    withdrawalsEnabled: boolean
  }
  effective: RealMoneyGateSettings
  updatedAt: string | null
}
export type RiskSummary = { limits: { maxOpenPositions: number; maxOpenExposure: string; marketMaxAgeMs: number; feeRate: string }; exposure: { openPositions: number; total: string; byAsset: Array<{ symbol: string; amount: string }> }; monitoring: { pendingOrders: number; rejectedOrders24h: number } }
export type AuditRecord = { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; ipAddress: string | null; userAgent: string | null; createdAt: string; actorUser: { id: string; email: string } | null }
