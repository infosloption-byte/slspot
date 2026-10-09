import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import type { AuthSession } from '../auth/service.js'
import type { AdminService } from './service.js'

const session: AuthSession = {
  id: 'user-1',
  email: 'admin@example.com',
  status: 'ACTIVE',
  countryCode: 'LK',
  displayName: null,
  timezone: 'Asia/Colombo',
  locale: 'en-LK',
  emailVerifiedAt: new Date(),
  legalName: null,
  dateOfBirth: null,
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
  updateProfile: async () => session,
  getPreferences: async () => ({
    compactTradingLayout: false,
    priceMovementAlerts: false,
    soundEnabled: false,
    emailTradeResults: true,
    emailWalletUpdates: true,
    emailSecurityAlerts: true,
    emailAnnouncements: true,
    emailSupportUpdates: true,
  }),
  updatePreferences: async () => ({
    compactTradingLayout: false,
    priceMovementAlerts: false,
    soundEnabled: false,
    emailTradeResults: true,
    emailWalletUpdates: true,
    emailSecurityAlerts: true,
    emailAnnouncements: true,
    emailSupportUpdates: true,
  }),
  changePassword: async () => undefined,
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

function mockAdmin(overrides: Record<string, unknown> = {}) {
  return {
    requireAdmin: async (userId: string) => {
      assert.equal(userId, 'user-1')
      return { user: { id: userId, email: session.email, status: 'ACTIVE' }, role: 'ADMIN' }
    },
    getMe: async () => ({ id: 'user-1', email: session.email, role: 'ADMIN' }),
    ...overrides,
  } as unknown as AdminService
}

describe('admin API routes', () => {
  it('denies unauthenticated admin access', async () => {
    const unauthenticated = { ...authService, authenticateSession: async () => null }
    const app = buildApp({ logging: false, authService: unauthenticated, adminService: mockAdmin() })
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/me' })
    assert.equal(response.statusCode, 401)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'UNAUTHENTICATED')
    await app.close()
  })

  it('enforces the admin service boundary after authentication', async () => {
    const gate = mockAdmin({
      requireAdmin: async () => {
        const error = new Error('Administrator access is required') as Error & { statusCode: number; code: string }
        error.statusCode = 403
        error.code = 'ADMIN_ACCESS_REQUIRED'
        throw error
      },
    })
    const app = buildApp({ logging: false, authService, adminService: gate })
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { cookie: 'slspot_session=test-session' },
    })
    assert.equal(response.statusCode, 403)
    await app.close()
  })

  it('binds admin mutations to the authenticated user', async () => {
    let actor = ''
    let target = ''
    const service = mockAdmin({
      setUserStatus: async (actorUserId: string, targetUserId: string, status: string) => {
        actor = actorUserId
        target = targetUserId
        assert.equal(status, 'SUSPENDED')
        return { id: targetUserId, email: 'user@example.com', status }
      },
    })
    const app = buildApp({ logging: false, authService, adminService: service })
    await app.ready()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/550e8400-e29b-41d4-a716-446655440000/status',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
      },
      payload: { status: 'SUSPENDED' },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(actor, 'user-1')
    assert.equal(target, '550e8400-e29b-41d4-a716-446655440000')
    await app.close()
  })

  it('binds real-money gate updates to the authenticated admin session', async () => {
    let actorUserId = ''
    const service = mockAdmin({
      updateRealMoneyGate: async (actor: string, input: {
        tradingEnabled: boolean
        depositsEnabled: boolean
        withdrawalsEnabled: boolean
      }) => {
        actorUserId = actor
        assert.deepEqual(input, {
          tradingEnabled: false,
          depositsEnabled: false,
          withdrawalsEnabled: false,
        })
        return {
          settings: input,
          environment: {
            launchApproved: false,
            tradingEnabled: false,
            depositsEnabled: false,
            withdrawalsEnabled: false,
          },
          effective: {
            tradingEnabled: false,
            depositsEnabled: false,
            withdrawalsEnabled: false,
          },
          updatedAt: null,
        }
      },
    })
    const app = buildApp({ logging: false, authService, adminService: service })
    await app.ready()
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/real-money-gate',
      headers: {
        cookie: 'slspot_session=test-session',
        'x-csrf-token': await csrfToken(app, 'slspot_session=test-session'),
      },
      payload: {
        tradingEnabled: false,
        depositsEnabled: false,
        withdrawalsEnabled: false,
      },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(actorUserId, 'user-1')
    assert.equal(response.json<{ data: { effective: { tradingEnabled: boolean } } }>().data.effective.tradingEnabled, false)
    await app.close()
  })

  it('registers the protected admin route surface', async () => {
    const app = buildApp({ logging: false, authService, adminService: mockAdmin() })
    await app.ready()
    const routes: Array<{ method: 'GET' | 'POST' | 'PUT'; url: string }> = [
      { method: 'GET', url: '/api/v1/admin/me' },
      { method: 'GET', url: '/api/v1/admin/dashboard' },
      { method: 'GET', url: '/api/v1/admin/users' },
      { method: 'GET', url: '/api/v1/admin/users/:userId' },
      { method: 'POST', url: '/api/v1/admin/users/:userId/status' },
      { method: 'POST', url: '/api/v1/admin/users/:userId/revoke-sessions' },
      { method: 'GET', url: '/api/v1/admin/trades' },
      { method: 'GET', url: '/api/v1/admin/positions' },
      { method: 'GET', url: '/api/v1/admin/settlements' },
      { method: 'GET', url: '/api/v1/admin/assets' },
      { method: 'POST', url: '/api/v1/admin/assets/:assetId/status' },
      { method: 'POST', url: '/api/v1/admin/markets/:marketId/status' },
      { method: 'GET', url: '/api/v1/admin/wallets' },
      { method: 'GET', url: '/api/v1/admin/deposits' },
      { method: 'GET', url: '/api/v1/admin/withdrawals' },
      { method: 'GET', url: '/api/v1/admin/finance/reconciliation' },
      { method: 'GET', url: '/api/v1/admin/ledger' },
      { method: 'GET', url: '/api/v1/admin/real-money-gate' },
      { method: 'PUT', url: '/api/v1/admin/real-money-gate' },
      { method: 'GET', url: '/api/v1/admin/risk' },
      { method: 'GET', url: '/api/v1/admin/audit' },
      { method: 'GET', url: '/api/v1/admin/security-events' },
      { method: 'GET', url: '/api/v1/admin/support/tickets' },
      { method: 'GET', url: '/api/v1/admin/support/tickets/:ticketId' },
      { method: 'POST', url: '/api/v1/admin/support/tickets/:ticketId/messages' },
      { method: 'POST', url: '/api/v1/admin/support/tickets/:ticketId/close' },
      { method: 'GET', url: '/api/v1/admin/announcements' },
      { method: 'POST', url: '/api/v1/admin/announcements' },
      { method: 'POST', url: '/api/v1/admin/announcements/:announcementId/publish' },
      { method: 'POST', url: '/api/v1/admin/announcements/:announcementId/archive' },
      { method: 'GET', url: '/api/v1/admin/export/audit' },
    ]
    for (const route of routes) {
      assert.equal(app.hasRoute(route), true, 'missing ' + route.method + ' ' + route.url)
    }
    await app.close()
  })
})
