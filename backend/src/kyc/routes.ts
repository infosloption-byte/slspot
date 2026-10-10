import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthSession } from '../auth/service.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { env } from '../config/env.js'
import type { KycService } from './service.js'
import { KycSandboxProvider } from './sandbox.js'
import type { KycOutcome } from './types.js'

const PREFIX = '/api/v1/kyc'

async function requireSession(request: FastifyRequest, authService: AuthServiceLike): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  return session
}

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true as const, data, requestId: request.id }
}

export function registerKycRoutes(app: FastifyInstance, options: { authService: AuthServiceLike; kycService: KycService }): void {
  const { authService, kycService } = options

  // Vendor webhooks need the exact bytes that were signed, so this scope parses every body as a raw string.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 256 * 1024 }, (_request, body, done) => done(null, body))
    scope.post<{ Params: { provider: string }; Body: string | undefined }>(
      PREFIX + '/webhooks/:provider',
      { schema: { params: { type: 'object', required: ['provider'], properties: { provider: { type: 'string', pattern: '^[a-z0-9_]{1,40}$' } } } } },
      async (request) => ok(request, await kycService.handleWebhook(request.params.provider, typeof request.body === 'string' ? request.body : '', request.headers)),
    )
  })

  app.get(PREFIX + '/status', async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await kycService.getStatus(session.id))
  })

  app.post<{ Body: { documentType: string } }>(PREFIX + '/start', {
    schema: { body: { type: 'object', required: ['documentType'], additionalProperties: false, properties: { documentType: { type: 'string', maxLength: 32 } } } },
  }, async (request) => {
    const session = await requireSession(request, authService)
    return ok(request, await kycService.start(session.id, { documentType: request.body.documentType }))
  })

  // Sandbox verdicts: the tester picks an outcome and the server delivers the signed webhook to itself.
  if (env.kyc.sandbox) {
    app.post<{ Body: { outcome: KycOutcome } }>(PREFIX + '/sandbox/outcome', {
      schema: { body: { type: 'object', required: ['outcome'], additionalProperties: false, properties: { outcome: { type: 'string', enum: ['approved', 'rejected', 'review'] } } } },
    }, async (request) => {
      const session = await requireSession(request, authService)
      const adapter = kycService.provider
      if (!(adapter instanceof KycSandboxProvider)) throw new AuthError(400, 'NOT_SANDBOX', 'Sandbox verification is not active')
      const status = await kycService.getStatus(session.id)
      const current = status.case
      if (!current || (current.status !== 'PENDING' && current.status !== 'IN_REVIEW')) {
        throw new AuthError(409, 'NO_OPEN_CASE', 'Start a verification first')
      }
      const event = adapter.simulate('sbx_kyc_' + current.id, request.body.outcome)
      await kycService.handleWebhook(adapter.id, event.rawBody, event.headers)
      return ok(request, await kycService.getStatus(session.id))
    })
  }
}
