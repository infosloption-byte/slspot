import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import type { AuthSession } from '../auth/service.js'
import type { PlatformApiService } from './service.js'
import type { CandleInterval } from '../market/types.js'

const session: AuthSession = {
  id: 'user-1',
  email: 'user@example.com',
  status: 'ACTIVE',
  countryCode: 'LK',
  emailVerifiedAt: new Date(),
  sessionId: 'session-1',
  expiresAt: new Date(Date.now() + 60_000),
}

const authService: AuthServiceLike = {
  authenticateSession: async (token) => token ? session : null,
  register: async () => { throw new Error('not used') },
  login: async () => { throw new Error('not used') },
  logout: async () => {},
  logoutAll: async () => {},
  listSessions: async () => [],
  revokeSession: async () => {},
  verifyEmail: async () => session,
  requestEmailVerification: async () => null,
  requestPasswordReset: async () => null,
  resetPassword: async () => {},
  verifyTwoFactorChallenge: async () => { throw new Error('not used') },
  getTwoFactorStatus: async () => { throw new Error('not used') },
  setupTwoFactor: async () => { throw new Error('not used') },
  enableTwoFactor: async () => { throw new Error('not used') },
  disableTwoFactor: async () => { throw new Error('not used') },
  listDevices: async () => [],
  listLoginHistory: async () => [],
  listSecurityEvents: async () => [],
}

async function csrfToken(app: ReturnType<typeof buildApp>, sessionCookie: string): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/csrf',
    headers: { cookie: sessionCookie },
  })
  assert.equal(response.statusCode, 200)
  return response.json<{ data: { csrfToken: string } }>().data.csrfToken
}

const apiService = {
  listAssets: async (query: { page?: number; pageSize?: number }) => ({
    items: [],
    pagination: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
      total: 0,
      totalPages: 1,
    },
  }),
  getPortfolioSummary: async () => ({
    currency: 'USD',
    availableBalance: '100.00000000',
    heldBalance: '0.00000000',
    totalBalance: '100.00000000',
    openPositionCount: 0,
    tradeCount: 0,
    netPnl: '0',
  }),
  listPositions: async () => ({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
  listTrades: async () => ({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
  getWallet: async () => null,
  listWalletTransactions: async () => ({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
  listNotifications: async () => ({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
  markNotificationRead: async () => true,
} as unknown as PlatformApiService

const marketDataService = {
  getCandles: async (assetId: string, interval: CandleInterval, _limit: number) => ({
    assetId, symbol: 'BTC/USD', interval,
    candles: [{ assetId, symbol: 'BTC/USD', interval, openTime: new Date(0).toISOString(), closeTime: new Date(60_000).toISOString(), open: '100', high: '101', low: '99', close: '100.5', volume: '10' }],
  }),
}

const tradingService = {
  createTrade: async (_userId: string, input: {
    assetId: string
    direction: 'UP' | 'DOWN'
    amount: string
    durationSeconds: number
    clientRequestId: string
  }) => ({
    orderId: 'order-1',
    orderStatus: 'ACCEPTED',
    tradeId: 'trade-1',
    positionId: 'position-1',
    status: 'OPEN',
    direction: input.direction,
    amount: input.amount,
    entryPrice: '100',
    exitPrice: null,
    payoutRate: '0.8',
    fee: '0',
    grossPnl: null,
    netPnl: null,
    openedAt: new Date().toISOString(),
    closedAt: null,
    expiresAt: new Date(Date.now() + input.durationSeconds * 1000).toISOString(),
    settlementId: null,
    settlementPrice: null,
    settlementReference: null,
    entryProvider: null,
    entryTimestamp: null,
    settlementProvider: null,
    settlementTimestamp: null,
  }),
  closeTrade: async () => ({
    orderId: 'order-1',
    orderStatus: 'ACCEPTED',
    tradeId: 'trade-1',
    positionId: 'position-1',
    status: 'WON',
    direction: 'UP' as const,
    amount: '10',
    entryPrice: '100',
    exitPrice: '101',
    payoutRate: '0.8',
    fee: '0',
    grossPnl: '8',
    netPnl: '8',
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    expiresAt: null,
    settlementId: 'settlement-1',
    settlementPrice: '101',
    settlementReference: 'manual:trade-1',
    entryProvider: null,
    entryTimestamp: null,
    settlementProvider: null,
    settlementTimestamp: null,
  }),
  cancelTrade: async (_userId: string, _tradeId: string, _mode: 'DEMO' | 'REAL') => ({
    orderId: 'order-1',
    orderStatus: 'CANCELLED',
    tradeId: 'trade-1',
    positionId: 'position-1',
    status: 'CANCELLED',
    direction: 'UP' as const,
    amount: '10',
    entryPrice: '100',
    exitPrice: null,
    payoutRate: '0.8',
    fee: '0',
    grossPnl: '0',
    netPnl: '0',
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    expiresAt: null,
    settlementId: 'settlement-1',
    settlementPrice: null,
    settlementReference: 'cancel:trade-1',
    entryProvider: null,
    entryTimestamp: null,
    settlementProvider: null,
    settlementTimestamp: null,
  }),
};

describe('platform API routes', () => {
  it('requires a session for private resources', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService, tradingService })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/portfolio/summary',
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'UNAUTHENTICATED')
    await app.close()
  })

  it('returns a versioned success envelope for public market assets', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market/assets?page=2&pageSize=10',
    })

    assert.equal(response.statusCode, 200)
    const body = response.json<{ success: boolean; data: { pagination: { page: number; pageSize: number } } }>()
    assert.equal(body.success, true)
    assert.equal(body.data.pagination.page, 2)
    assert.equal(body.data.pagination.pageSize, 10)
    await app.close()
  })

  it('scopes private data to the authenticated user context', async () => {
    let requestedUserId = ''
    const scoped = {
      ...apiService,
      getPortfolioSummary: async (userId: string) => {
        requestedUserId = userId
        return {
          currency: 'USD',
          availableBalance: '0',
          heldBalance: '0',
          totalBalance: '0',
          openPositionCount: 0,
          tradeCount: 0,
          netPnl: '0',
        }
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/portfolio/summary',
      headers: { cookie: 'slspot_session=test-session' },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(requestedUserId, 'user-1')
    await app.close()
  })
  it('forwards the selected wallet mode to private account resources', async () => {
    let requestedMode = ''
    const scoped = {
      ...apiService,
      getPortfolioSummary: async (_userId: string, mode: string) => {
        requestedMode = mode
        return {
          currency: 'USD',
          availableBalance: '0',
          heldBalance: '0',
          totalBalance: '0',
          openPositionCount: 0,
          tradeCount: 0,
          netPnl: '0',
        }
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/portfolio/summary',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-wallet-mode': 'REAL',
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(requestedMode, 'REAL')
    await app.close()
  })

  it('returns normalized market candles from the market data service', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService })
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/v1/market/assets/asset-1/candles?interval=5min&limit=20' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json<{ data: { candles: unknown[] } }>().data.candles.length, 1)
    await app.close()
  })

  it('rejects invalid market asset type values', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market/assets?type=NOT_A_REAL_ASSET',
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'INVALID_QUERY')
    await app.close()
  })

  it('binds private wallet requests to the authenticated user', async () => {
    let requestedUserId = ''
    const scoped = {
      ...apiService,
      getWallet: async (userId: string) => {
        requestedUserId = userId
        return null
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: { cookie: 'slspot_session=test-session' },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(requestedUserId, 'user-1')
    await app.close()
  })


  it('forwards trade history filters and pagination controls', async () => {
    type CapturedTradeHistoryInput = {
      page?: number
      pageSize?: number
      statuses?: Array<'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'>
      search?: string
      assetId?: string
      direction?: 'UP' | 'DOWN'
      from?: Date
      to?: Date
      sortBy?: 'openedAt' | 'closedAt' | 'amount' | 'netPnl'
      sortOrder?: 'asc' | 'desc'
      settledOnly?: boolean
    }

    const captured = {
      input: null as CapturedTradeHistoryInput | null,
      mode: '' as 'DEMO' | 'REAL' | '',
    }

    const scoped = {
      ...apiService,
      listTrades: async (_userId: string, input: CapturedTradeHistoryInput, mode: 'DEMO' | 'REAL') => {
        captured.input = input
        captured.mode = mode
        return { items: [], pagination: { page: input.page ?? 1, pageSize: input.pageSize ?? 25, total: 0, totalPages: 1 } }
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped, marketDataService })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/trades?page=2&pageSize=25&status=WON,LOST&search=BTC&assetId=asset-1&direction=UP&from=2026-10-01T00:00:00.000Z&to=2026-10-03T23:59:59.999Z&sortBy=netPnl&sortOrder=asc&settledOnly=true',
      headers: { cookie: 'slspot_session=test-session', 'x-wallet-mode': 'DEMO' },
    })

    assert.equal(response.statusCode, 200)
    const requested = captured.input
    if (!requested) throw new Error('Trade history request was not captured')
    assert.deepEqual(requested.statuses, ['WON', 'LOST'])
    assert.equal(requested.page, 2)
    assert.equal(requested.pageSize, 25)
    assert.equal(requested.search, 'BTC')
    assert.equal(requested.assetId, 'asset-1')
    assert.equal(requested.direction, 'UP')
    assert.equal(requested.sortBy, 'netPnl')
    assert.equal(requested.sortOrder, 'asc')
    assert.equal(requested.settledOnly, true)
    assert.equal(captured.mode, 'DEMO')
    await app.close()
  })

  it('registers the complete platform API route surface', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService })
    await app.ready()

    const routes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/api/v1/market/assets' },
      { method: 'GET', url: '/api/v1/auth/capabilities' },
      { method: 'GET', url: '/api/v1/market/assets/:assetId/candles' },
      { method: 'GET', url: '/api/v1/portfolio/summary' },
      { method: 'GET', url: '/api/v1/portfolio/analytics' },
      { method: 'GET', url: '/api/v1/portfolio/positions' },
      { method: 'GET', url: '/api/v1/trades' },
      { method: 'POST', url: '/api/v1/trades' },
      { method: 'POST', url: '/api/v1/trades/:tradeId/close' },
      { method: 'POST', url: '/api/v1/trades/:tradeId/cancel' },
      { method: 'GET', url: '/api/v1/wallets' },
      { method: 'GET', url: '/api/v1/wallet' },
      { method: 'GET', url: '/api/v1/wallet/transactions' },
      { method: 'POST', url: '/api/v1/wallet/deposit' },
      { method: 'POST', url: '/api/v1/wallet/withdraw' },
      { method: 'GET', url: '/api/v1/ledger/reconcile' },
      { method: 'GET', url: '/api/v1/notifications' },
      { method: 'POST', url: '/api/v1/notifications/:notificationId/read' },
      { method: 'POST', url: '/api/v1/notifications/read-all' },
    ]

    for (const route of routes) {
      assert.equal(
        app.hasRoute(route),
        true,
        'missing registered route: ' + route.method + ' ' + route.url,
      )
    }

    await app.close()
  })

  it('binds capabilities to the authenticated user', async () => {
    let requestedUserId = ''
    const scoped = {
      ...apiService,
      getCapabilities: async (userId: string) => {
        requestedUserId = userId
        return {
          trading: {
            DEMO: { enabled: true, reason: null },
            REAL: { enabled: false, reason: 'Real trading is not enabled' },
          },
          funding: {
            deposit: {
              DEMO: { enabled: true, reason: null },
              REAL: { enabled: false, reason: 'Real deposits are not enabled' },
            },
            withdrawal: {
              DEMO: { enabled: true, reason: null },
              REAL: { enabled: false, reason: 'Real withdrawals are not enabled' },
            },
          },
        }
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped })
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/capabilities',
      headers: { cookie: 'slspot_session=test-session' },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(requestedUserId, 'user-1')
    assert.equal(response.json<{ data: { trading: { REAL: { enabled: boolean } } } }>().data.trading.REAL.enabled, false)
    await app.close()
  })

  it('requires an idempotency key for trade creation', async () => {
    const app = buildApp({ logging: false, authService, apiService, tradingService })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
      },
      payload: {
        assetId: 'asset-1',
        direction: 'UP',
        amount: '10',
        durationSeconds: 60,
      },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'INVALID_IDEMPOTENCY_KEY')
    await app.close()
  })

  it('passes an idempotent trade request to the trading service', async () => {
    let request = ''
    const scopedTradingService = {
      ...tradingService,
      createTrade: async (_userId: string, input: Parameters<typeof tradingService.createTrade>[1]) => {
        request = input.clientRequestId
        return tradingService.createTrade('user-1', input)
      },
    }

    const app = buildApp({ logging: false, authService, apiService, tradingService: scopedTradingService })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
        'idempotency-key': 'test-trade-123',
      },
      payload: {
        assetId: 'asset-1',
        direction: 'UP',
        amount: '10',
        durationSeconds: 60,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(request, 'test-trade-123')
    assert.equal(response.json<{ data: { tradeId: string } }>().data.tradeId, 'trade-1')
    await app.close()
  })

  it('passes cancellation through the authenticated trading service', async () => {
    let requestedTradeId = ''
    const scopedTradingService = {
      ...tradingService,
      cancelTrade: async (_userId: string, tradeId: string, mode: 'DEMO' | 'REAL') => {
        requestedTradeId = tradeId
        return tradingService.cancelTrade(_userId, tradeId, mode)
      },
    }
    const app = buildApp({ logging: false, authService, apiService, tradingService: scopedTradingService })
    await app.ready()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/550e8400-e29b-41d4-a716-446655440001/cancel',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
      },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(requestedTradeId, '550e8400-e29b-41d4-a716-446655440001')
    assert.equal(response.json<{ data: { status: string } }>().data.status, 'CANCELLED')
    await app.close()
  })

  it('binds notification reads to the authenticated user', async () => {
    let requestedUserId = ''
    let requestedNotificationId = ''
    const scoped = {
      ...apiService,
      markNotificationRead: async (userId: string, notificationId: string) => {
        requestedUserId = userId
        requestedNotificationId = notificationId
        return true
      },
    } as unknown as PlatformApiService

    const app = buildApp({ logging: false, authService, apiService: scoped })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(requestedUserId, 'user-1')
    assert.equal(requestedNotificationId, '550e8400-e29b-41d4-a716-446655440001')
    await app.close()
  })

})
