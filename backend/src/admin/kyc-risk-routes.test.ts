import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import type { KycService } from '../kyc/service.js'
import type { AdminService } from './service.js'
import type { RiskControlService } from './risk-service.js'

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000'
const COOKIE = 'slspot_session=test-session'
const session = { id: 'user-1', email: 'admin@example.com', status: 'ACTIVE', sessionId: 'session-1', expiresAt: new Date(Date.now() + 60_000) }
const authService = { authenticateSession: async (token?: string) => (token ? session : null) } as unknown as AuthServiceLike

const adminService = (role: 'ADMIN' | 'SUPER_ADMIN' | null = 'ADMIN') => ({
  requireAdmin: async () => {
    if (!role) throw Object.assign(new Error('Administrator access is required'), { statusCode: 403, code: 'ADMIN_ACCESS_REQUIRED' })
    return { role, user: { id: 'user-1', email: session.email, status: 'ACTIVE' } }
  },
}) as unknown as AdminService

async function post(app: ReturnType<typeof buildApp>, url: string, payload: unknown, authenticated = true, method: 'POST' | 'PUT' = 'POST') {
  const csrf = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf', headers: { cookie: COOKIE } })
  const token = csrf.json<{ data: { csrfToken: string } }>().data.csrfToken
  return app.inject({ method, url, headers: authenticated ? { cookie: COOKIE, 'x-csrf-token': token } : { 'x-csrf-token': token }, payload: payload as object })
}

describe('customer KYC upload and submit routes', () => {
  const photo = Buffer.from('photo-bytes').toString('base64')

  it('requires a session', async () => {
    const app = buildApp({ logging: false, authService, kycService: {} as KycService })
    await app.ready()
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/kyc/status' })).statusCode, 401)
    await app.close()
  })

  it('decodes the photo (with or without a data URL prefix) and binds it to the signed-in user', async () => {
    const received: Array<{ userId: string; kind: string; data: string }> = []
    const kycService = {
      uploadDocument: async (userId: string, input: { kind: string; data: Buffer }) => { received.push({ userId, kind: input.kind, data: input.data.toString() }); return { status: 'PENDING' } },
    } as unknown as KycService
    const app = buildApp({ logging: false, authService, kycService })
    await app.ready()
    assert.equal((await post(app, '/api/v1/kyc/documents', { kind: 'ID_FRONT', data: photo })).statusCode, 200)
    assert.equal((await post(app, '/api/v1/kyc/documents', { kind: 'SELFIE', data: 'data:image/jpeg;base64,' + photo })).statusCode, 200)
    assert.deepEqual(received, [
      { userId: 'user-1', kind: 'ID_FRONT', data: 'photo-bytes' },
      { userId: 'user-1', kind: 'SELFIE', data: 'photo-bytes' },
    ])
    await app.close()
  })

  it('rejects malformed uploads before they reach the service', async () => {
    let called = false
    const kycService = { uploadDocument: async () => { called = true } } as unknown as KycService
    const app = buildApp({ logging: false, authService, kycService })
    await app.ready()
    assert.equal((await post(app, '/api/v1/kyc/documents', { kind: 'ID_FRONT', data: 'not base64 !!!' })).statusCode, 400)
    assert.equal((await post(app, '/api/v1/kyc/documents', { kind: 'ID_FRONT' })).statusCode, 400)
    assert.equal(called, false)
    await app.close()
  })

  it('submits the signed-in user\'s case', async () => {
    let submittedFor = ''
    const kycService = { submitForReview: async (userId: string) => { submittedFor = userId; return { status: 'IN_REVIEW' } } } as unknown as KycService
    const app = buildApp({ logging: false, authService, kycService })
    await app.ready()
    const response = await post(app, '/api/v1/kyc/submit', {})
    assert.equal(response.statusCode, 200)
    assert.equal(submittedFor, 'user-1')
    await app.close()
  })
})

describe('admin KYC review routes', () => {
  it('lets only administrators in, before touching any document', async () => {
    let touched = false
    const kycService = { readDocument: async () => { touched = true }, approveCase: async () => { touched = true }, rejectCase: async () => { touched = true }, listCaseDocuments: async () => { touched = true } } as unknown as KycService
    const app = buildApp({ logging: false, authService, adminService: adminService(null), kycService })
    await app.ready()
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/kyc/documents/' + CASE_ID, headers: { cookie: COOKIE } })).statusCode, 403)
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/kyc/cases/' + CASE_ID + '/documents', headers: { cookie: COOKIE } })).statusCode, 403)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/approve', {})).statusCode, 403)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/reject', { reason: 'Blurry photo' })).statusCode, 403)
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/kyc/documents/' + CASE_ID })).statusCode, 401)
    assert.equal(touched, false)
    await app.close()
  })

  it('returns an opened document uncached and records who opened it', async () => {
    let viewer = ''
    const kycService = { readDocument: async (adminId: string) => { viewer = adminId; return { kind: 'SELFIE', mimeType: 'image/jpeg', data: Buffer.from('abc') } } } as unknown as KycService
    const app = buildApp({ logging: false, authService, adminService: adminService(), kycService })
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/kyc/documents/' + CASE_ID, headers: { cookie: COOKIE } })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.deepEqual(response.json<{ data: unknown }>().data, { kind: 'SELFIE', mimeType: 'image/jpeg', data: Buffer.from('abc').toString('base64') })
    assert.equal(viewer, 'user-1')
    await app.close()
  })

  it('passes the checklist and reason through and validates them', async () => {
    const calls: unknown[][] = []
    const kycService = {
      approveCase: async (...args: unknown[]) => { calls.push(['approve', ...args]) },
      rejectCase: async (...args: unknown[]) => { calls.push(['reject', ...args]) },
    } as unknown as KycService
    const app = buildApp({ logging: false, authService, adminService: adminService(), kycService })
    await app.ready()
    const checklist = { nameMatches: true, dateOfBirthMatches: true, notExpired: true, selfieMatches: true, noSignsOfTampering: true, sanctionsChecked: true }
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/approve', { checklist })).statusCode, 200)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/approve', { checklist: { nameMatches: 'yes' } })).statusCode, 400)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/not-a-uuid/approve', {})).statusCode, 400)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/reject', { reason: 'ab' })).statusCode, 400)
    assert.equal((await post(app, '/api/v1/admin/kyc/cases/' + CASE_ID + '/reject', { reason: 'Photo is too blurry' })).statusCode, 200)
    assert.deepEqual(calls, [['approve', 'user-1', CASE_ID, checklist], ['reject', 'user-1', CASE_ID, 'Photo is too blurry']])
    await app.close()
  })
})

describe('admin risk settings routes', () => {
  it('binds updates to the signed-in administrator', async () => {
    let seen: { actor: string; input: unknown } | undefined
    const riskService = {
      getSettings: async () => ({ limits: {} }),
      updateSettings: async (actor: string, input: unknown) => { seen = { actor, input }; return { limits: input } },
      collectAlerts: async () => [{ code: 'KYC_STUCK' }],
    } as unknown as RiskControlService
    const app = buildApp({ logging: false, authService, adminService: adminService(), riskService })
    await app.ready()
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/risk-settings', headers: { cookie: COOKIE } })).statusCode, 200)
    assert.equal((await post(app, '/api/v1/admin/risk-settings', { maxTradeAmount: '50' }, true, 'PUT')).statusCode, 200)
    assert.deepEqual(seen, { actor: 'user-1', input: { maxTradeAmount: '50' } })
    const alerts = await app.inject({ method: 'GET', url: '/api/v1/admin/alerts', headers: { cookie: COOKIE } })
    assert.equal(alerts.json<{ data: { alerts: unknown[] } }>().data.alerts.length, 1)
    await app.close()
  })

  it('requires an administrator and a session', async () => {
    const riskService = { getSettings: async () => ({}), collectAlerts: async () => [] } as unknown as RiskControlService
    const app = buildApp({ logging: false, authService, adminService: adminService(null), riskService })
    await app.ready()
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/risk-settings', headers: { cookie: COOKIE } })).statusCode, 403)
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/alerts' })).statusCode, 401)
    await app.close()
  })
})
