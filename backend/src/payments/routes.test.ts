import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildApp } from '../app.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { PaymentProviderRegistry } from './registry.js'
import { createSandboxProviders, SANDBOX_SIGNATURE_HEADER } from './sandbox.js'
import { InvalidWebhookSignatureError } from './types.js'
import type { PaymentService } from './service.js'

const authService = { authenticateSession: async () => null } as unknown as AuthServiceLike

describe('sandbox provider', () => {
  const providers = createSandboxProviders('test-secret')
  const card = providers.find((provider) => provider.capabilities.id === 'card')!

  it('offers the four planned providers', () => {
    assert.deepEqual(providers.map((p) => p.capabilities.id).sort(), ['binance_pay', 'card', 'neteller', 'skrill'])
    assert.ok(providers.every((p) => p.capabilities.sandbox))
  })

  it('accepts its own signed webhook and rejects tampering', () => {
    const { rawBody, headers } = card.simulate('sbx_dep_1', 'succeed', '25.00000000', 'USD')
    const event = card.verifyWebhook(rawBody, headers)
    assert.equal(event.type, 'deposit.completed')
    assert.equal(event.providerReference, 'sbx_dep_1')
    assert.throws(() => card.verifyWebhook(rawBody + ' ', headers), InvalidWebhookSignatureError)
    assert.throws(() => card.verifyWebhook(rawBody, {}), InvalidWebhookSignatureError)
    assert.throws(() => card.verifyWebhook(rawBody, { [SANDBOX_SIGNATURE_HEADER]: 'zz' }), InvalidWebhookSignatureError)
  })

  it('pays out immediately (the stop point before real money moves)', async () => {
    const result = await card.createPayout({ withdrawalId: 'w1', amount: '10', currency: 'USD', details: {}, user: { id: 'u', email: 'a@b.c', countryCode: 'LK' } })
    assert.equal(result.status, 'COMPLETED')
  })
})

describe('payment routes', () => {
  it('passes the exact raw webhook body to the service without a session or CSRF token', async () => {
    let received: { provider: string; body: string } | undefined
    const paymentService = {
      handleWebhook: async (provider: string, body: string) => {
        received = { provider, body }
        return { status: 'processed' as const }
      },
    } as unknown as PaymentService
    const app = buildApp({ logging: false, authService, paymentService, paymentRegistry: new PaymentProviderRegistry() })
    await app.ready()
    const body = '{ "id" : "evt_1",   "type":"deposit.completed" }'
    const response = await app.inject({ method: 'POST', url: '/api/v1/payments/webhooks/card', headers: { 'content-type': 'text/plain' }, payload: body })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(received, { provider: 'card', body })
    await app.close()
  })

  it('requires a session for private payment resources', async () => {
    const app = buildApp({ logging: false, authService, paymentService: {} as PaymentService, paymentRegistry: new PaymentProviderRegistry() })
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/v1/payments/eligibility' })
    assert.equal(response.statusCode, 401)
    await app.close()
  })
})
