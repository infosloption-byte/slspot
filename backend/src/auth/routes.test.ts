import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import { createCsrfToken } from '../security/csrf.js'
import type { AuthServiceLike } from './routes.js'

const user = {
  id: 'user-1',
  email: 'trader@example.com',
  status: 'ACTIVE',
  countryCode: 'LK',
  displayName: null,
  timezone: 'Asia/Colombo',
  locale: 'en-LK',
  emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
}

function createMockAuthService(): AuthServiceLike {
  const token = 'test-session-token'
  const sessionId = 'session-1'
  const expiresAt = new Date(Date.now() + 60_000)

  return {
    register: async () => ({ created: true, user, verification: null }),
    login: async () => ({ requiresTwoFactor: false as const, session: { ...user, sessionId, expiresAt }, sessionToken: token }),
    verifyTwoFactorChallenge: async () => ({ requiresTwoFactor: false as const, session: { ...user, sessionId, expiresAt }, sessionToken: token }),
    getTwoFactorStatus: async () => ({ enabled: false, recoveryCodesRemaining: 0 }),
    setupTwoFactor: async () => ({ enabled: false, secret: 'TESTSECRET', otpauthUri: 'otpauth://totp/test' }),
    enableTwoFactor: async () => ({ enabled: true as const, recoveryCodes: ['AAAA-BBBB-CCCC-DDDD'] }),
    disableTwoFactor: async () => undefined,
    listDevices: async () => [],
    listLoginHistory: async () => [],
    listSecurityEvents: async () => [],
    updateProfile: async () => user,
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
    authenticateSession: async (sessionToken) =>
      sessionToken === token ? { ...user, sessionId, expiresAt } : null,
    logout: async () => undefined,
    logoutAll: async () => undefined,
    listSessions: async () => [{
      id: sessionId,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      lastSeenAt: new Date('2026-10-02T00:00:00.000Z'),
      expiresAt,
      current: true,
      deviceId: 'device-1',
    }],
    revokeSession: async () => undefined,
    verifyEmail: async () => user,
    requestEmailVerification: async () => null,
    requestPasswordReset: async () => null,
    resetPassword: async () => undefined,
  }
}

function csrfToken(sessionCookie?: string): string {
  const sessionToken = sessionCookie?.split(';')[0]?.split('=')[1]
  return createCsrfToken(sessionToken)
}

describe('authentication routes', () => {
  it('rejects protected endpoints without a session cookie', async () => {
    const app = buildApp({ logging: false, authService: createMockAuthService() })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'UNAUTHENTICATED')
    await app.close()
  })

  it('keeps registration response generic', async () => {
    const app = buildApp({ logging: false, authService: createMockAuthService() })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-csrf-token': csrfToken() },
      payload: { email: user.email, password: 'A-strong-password-123', acceptTerms: true },
    })

    assert.equal(response.statusCode, 202)
    const body = response.json<{ data: Record<string, unknown> }>()
    assert.equal(body.data.accepted, true)
    assert.equal('user' in body.data, false)
    await app.close()
  })

  it('sets an HttpOnly session cookie after login', async () => {
    const app = buildApp({ logging: false, authService: createMockAuthService() })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-csrf-token': csrfToken() },
      payload: { email: user.email, password: 'A-strong-password-123' },
    })

    assert.equal(response.statusCode, 200)
    assert.match(String(response.headers['set-cookie']), /HttpOnly/i)
    assert.match(String(response.headers['set-cookie']), /slspot_session=/i)
    await app.close()
  })

  it('authenticates a follow-up request with the issued cookie', async () => {
    const app = buildApp({ logging: false, authService: createMockAuthService() })
    await app.ready()

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-csrf-token': csrfToken() },
      payload: { email: user.email, password: 'A-strong-password-123' },
    })
    const cookie = String(login.headers['set-cookie']).split(';')[0]

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    })

    assert.equal(me.statusCode, 200)
    assert.equal(me.json<{ data: { user: { id: string } } }>().data.user.id, user.id)
    await app.close()
  })
  it('routes a two-factor challenge before creating a session', async () => {
    const app = buildApp({
      logging: false,
      authService: {
        ...createMockAuthService(),
        login: async () => ({
          requiresTwoFactor: true as const,
          user,
          challengeToken: 'test-two-factor-challenge',
          challengeExpiresAt: new Date(Date.now() + 300_000),
        }),
      },
    })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-csrf-token': csrfToken() },
      payload: { email: user.email, password: 'A-strong-password-123', rememberDevice: true },
    })

    assert.equal(response.statusCode, 202)
    assert.equal(response.headers['set-cookie'], undefined)
    assert.equal(response.json<{ data: { requiresTwoFactor: boolean } }>().data.requiresTwoFactor, true)
    await app.close()
  })

  it('registers account-management routes and binds profile operations to the session', async () => {
    let profileUserId = ''
    let passwordUserId = ''
    const service = createMockAuthService()
    service.updateProfile = async (userId: string) => {
      profileUserId = userId
      return user
    }
    service.changePassword = async (userId: string) => {
      passwordUserId = userId
    }

    const app = buildApp({ logging: false, authService: service })
    await app.ready()

    const profile = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: { cookie: 'slspot_session=test-session-token', 'x-csrf-token': csrfToken('slspot_session=test-session-token') },
      payload: { displayName: 'Trader', timezone: 'Asia/Colombo', locale: 'en-LK', countryCode: 'LK' },
    })
    assert.equal(profile.statusCode, 200)
    assert.equal(profileUserId, 'user-1')

    const preferences = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/preferences',
      headers: { cookie: 'slspot_session=test-session-token' },
    })
    assert.equal(preferences.statusCode, 200)

    const supportPreference = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/preferences',
      headers: { cookie: 'slspot_session=test-session-token', 'x-csrf-token': csrfToken('slspot_session=test-session-token') },
      payload: { emailSupportUpdates: false },
    })
    assert.equal(supportPreference.statusCode, 200)

    const password = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: { cookie: 'slspot_session=test-session-token', 'x-csrf-token': csrfToken('slspot_session=test-session-token') },
      payload: { currentPassword: 'old-password-123', newPassword: 'new-password-123' },
    })
    assert.equal(password.statusCode, 200)
    assert.equal(passwordUserId, 'user-1')

    await app.close()
  })

  it('requires registration consent', async () => {
    const app = buildApp({ logging: false, authService: createMockAuthService() })
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-csrf-token': csrfToken() },
      payload: { email: user.email, password: 'A-strong-password-123', acceptTerms: false },
    })

    assert.equal(response.statusCode, 400)
    await app.close()
  })

})
