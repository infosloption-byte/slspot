import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from './routes.js'

const user = {
  id: 'user-1',
  email: 'trader@example.com',
  status: 'ACTIVE',
  countryCode: 'LK',
  emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
}

function createMockAuthService(): AuthServiceLike {
  const token = 'test-session-token'
  const sessionId = 'session-1'
  const expiresAt = new Date(Date.now() + 60_000)

  return {
    register: async () => ({ created: true, user, verification: null }),
    login: async () => ({ session: { ...user, sessionId, expiresAt }, sessionToken: token }),
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
    }],
    revokeSession: async () => undefined,
    verifyEmail: async () => user,
    requestEmailVerification: async () => null,
    requestPasswordReset: async () => null,
    resetPassword: async () => undefined,
  }
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
      payload: { email: user.email, password: 'A-strong-password-123' },
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
})
