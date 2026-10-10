import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import type { KycService } from './service.js'

const authService = { authenticateSession: async () => null } as unknown as AuthServiceLike

describe('KYC routes', () => {
  it('passes the exact raw webhook body to the service without a session or CSRF token', async () => {
    let received: { provider: string; body: string } | undefined
    const kycService = {
      handleWebhook: async (provider: string, body: string) => { received = { provider, body }; return { status: 'processed' as const } },
    } as unknown as KycService
    const app = buildApp({ logging: false, authService, kycService })
    await app.ready()
    const body = '{ "id" : "evt_1",  "outcome":"approved" }'
    const response = await app.inject({ method: 'POST', url: '/api/v1/kyc/webhooks/sandbox', headers: { 'content-type': 'text/plain' }, payload: body })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(received, { provider: 'sandbox', body })
    await app.close()
  })

  it('requires a session for the customer status', async () => {
    const app = buildApp({ logging: false, authService, kycService: {} as KycService })
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/v1/kyc/status' })
    assert.equal(response.statusCode, 401)
    await app.close()
  })
})
