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
  }),
  closeTrade: async () => ({
    orderId: 'order-1',
    tradeId: 'trade-1',
    positionId: 'position-1',
    status: 'WON',
    direction: 'UP',
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


  it('registers the complete platform API route surface', async () => {
    const app = buildApp({ logging: false, authService, apiService, marketDataService })
    await app.ready()

    for (const url of [
      '/api/v1/market/assets',
      '/api/v1/market/assets/:assetId/candles',
      '/api/v1/portfolio/summary',
      '/api/v1/portfolio/positions',
      '/api/v1/trades',
      '/api/v1/wallet',
      '/api/v1/wallet/transactions',
      '/api/v1/notifications',
      '/api/v1/notifications/:notificationId/read',
    ]) {
      assert.equal(
        app.hasRoute({ method: url.endsWith('/read') ? 'POST' : 'GET', url }),
        true,
        'missing registered route: ' + url,
      )
    }

    await app.close()
  })

  it('requires an idempotency key for trade creation', async () => {
    const app = buildApp({ logging: false, authService, apiService, tradingService })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: 'slspot_session=test-session' },
      payload: {
        assetId: 'asset-1',
        direction: 'UP',
        amount: '10',
        durationSeconds: 60,
      },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'IDEMPOTENCY_REQUIRED')
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
      url: '/api/v1/notifications/notification-1/read',
      headers: { cookie: 'slspot_session=test-session' },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(requestedUserId, 'user-1')
    assert.equal(requestedNotificationId, 'notification-1')
    await app.close()
  })

})
