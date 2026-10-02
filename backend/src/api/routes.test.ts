import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import type { AuthSession } from '../auth/service.js'
import type { PlatformApiService } from './service.js'

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
  listAssets: async () => ({
    items: [],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
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

describe('platform API routes', () => {
  it('requires a session for private resources', async () => {
    const app = buildApp({ logging: false, authService, apiService })
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
    const app = buildApp({ logging: false, authService, apiService })
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
  it('rejects invalid market asset type values', async () => {
    const app = buildApp({ logging: false, authService, apiService })
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
