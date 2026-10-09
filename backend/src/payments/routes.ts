import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthSession } from '../auth/service.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { env } from '../config/env.js'
import type { PaymentService } from './service.js'
import { SandboxProvider, type SandboxOutcome } from './sandbox.js'
import type { PaymentProviderRegistry } from './registry.js'

const PREFIX = '/api/v1/payments'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
const PROVIDER_PATTERN = '^[a-z0-9_]{1,40}$'

export type PaymentRoutesOptions = {
  authService: AuthServiceLike
  paymentService: PaymentService
  registry: PaymentProviderRegistry
}

async function requireSession(request: FastifyRequest, authService: AuthServiceLike): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  return session
}

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true as const, data, requestId: request.id }
}

function idempotencyKey(request: FastifyRequest, bodyValue: string | undefined): string {
  const header = request.headers['idempotency-key']
  const value = (Array.isArray(header) ? header[0] : header) ?? bodyValue
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new AuthError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required')
  }
  return value
}

const amountSchema = { anyOf: [{ type: 'string', minLength: 1, maxLength: 32 }, { type: 'number', exclusiveMinimum: 0 }] } as const

export function registerPaymentRoutes(app: FastifyInstance, options: PaymentRoutesOptions): void {
  const { paymentService, authService, registry } = options
  const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: UUID_PATTERN } } } as const

  // Provider webhooks need the exact bytes that were signed, so this scope parses every body as a raw string.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 256 * 1024 }, (_request, body, done) => done(null, body))
    scope.post<{ Params: { provider: string }; Body: string | undefined }>(
      PREFIX + '/webhooks/:provider',
      { schema: { params: { type: 'object', required: ['provider'], properties: { provider: { type: 'string', pattern: PROVIDER_PATTERN } } } } },
      async (request) => {
        const result = await paymentService.handleWebhook(request.params.provider, typeof request.body === 'string' ? request.body : '', request.headers)
        return ok(request, result)
      },
    )
  })

  app.get<{ Querystring: { direction?: string } }>(PREFIX + '/methods', async (request) => {
    const session = await requireSession(request, authService)
    const direction = request.query.direction
    if (direction !== 'deposit' && direction !== 'withdrawal') throw new AuthError(400, 'INVALID_QUERY', 'direction must be deposit or withdrawal')
    return ok(request, await paymentService.listMethods(session.id, direction))
  })

  app.get(PREFIX + '/eligibility', async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await paymentService.getEligibility(session.id))
  })

  app.post<{ Body: { provider: string; amount: string | number; clientRequestId?: string } }>(PREFIX + '/deposits', {
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'amount'],
        additionalProperties: false,
        properties: {
          provider: { type: 'string', pattern: PROVIDER_PATTERN },
          amount: amountSchema,
          clientRequestId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const session = await requireSession(request, authService)
    const key = idempotencyKey(request, request.body.clientRequestId)
    const deposit = await paymentService.createDeposit(session.id, { provider: request.body.provider, amount: String(request.body.amount), clientRequestId: key })
    return reply.status(201).send(ok(request, deposit))
  })

  app.get<{ Params: { id: string } }>(PREFIX + '/deposits/:id', { schema: { params: idParams } }, async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await paymentService.getDeposit(session.id, request.params.id))
  })

  app.post<{ Params: { id: string } }>(PREFIX + '/deposits/:id/cancel', { schema: { params: idParams } }, async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await paymentService.cancelDeposit(session.id, request.params.id))
  })

  app.post<{ Body: { provider: string; amount: string | number; details?: Record<string, unknown>; clientRequestId?: string } }>(PREFIX + '/withdrawals', {
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'amount'],
        additionalProperties: false,
        properties: {
          provider: { type: 'string', pattern: PROVIDER_PATTERN },
          amount: amountSchema,
          details: { type: 'object', additionalProperties: { type: 'string', maxLength: 255 }, maxProperties: 20 },
          clientRequestId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const session = await requireSession(request, authService)
    const key = idempotencyKey(request, request.body.clientRequestId)
    const withdrawal = await paymentService.createWithdrawal(session.id, {
      provider: request.body.provider,
      amount: String(request.body.amount),
      details: request.body.details ?? {},
      clientRequestId: key,
    })
    return reply.status(201).send(ok(request, withdrawal))
  })

  app.get<{ Params: { id: string } }>(PREFIX + '/withdrawals/:id', { schema: { params: idParams } }, async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await paymentService.getWithdrawal(session.id, request.params.id))
  })

  app.post<{ Params: { id: string } }>(PREFIX + '/withdrawals/:id/cancel', { schema: { params: idParams } }, async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await paymentService.cancelWithdrawal(session.id, request.params.id))
  })

  // Sandbox checkout: the tester picks an outcome and the server delivers the signed webhook to itself,
  // exactly as a real provider would. Only registered when sandbox adapters exist (never in production).
  if (env.payments.sandbox) {
    app.post<{ Params: { id: string }; Body: { outcome: SandboxOutcome } }>(PREFIX + '/sandbox/deposits/:id/outcome', {
      schema: {
        params: idParams,
        body: { type: 'object', required: ['outcome'], additionalProperties: false, properties: { outcome: { type: 'string', enum: ['succeed', 'fail', 'pending'] } } },
      },
    }, async (request) => {
      const session = await requireSession(request, authService)
      const deposit = await paymentService.getDeposit(session.id, request.params.id)
      const adapter = registry.get(deposit.provider)
      if (!(adapter instanceof SandboxProvider) || !deposit.providerReference) {
        throw new AuthError(400, 'NOT_SANDBOX', 'This deposit is not a sandbox deposit')
      }
      const event = adapter.simulate(deposit.providerReference, request.body.outcome, deposit.amount, deposit.currency)
      await paymentService.handleWebhook(deposit.provider, event.rawBody, event.headers)
      return ok(request, await paymentService.getDeposit(session.id, request.params.id))
    })
  }
}
