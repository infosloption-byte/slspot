import { randomUUID } from 'node:crypto'
import Fastify, { LogController, type FastifyError, type FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'
import { RealtimeGateway } from './realtime/gateway.js'
import { registerPlatformApiRoutes } from './api/routes.js'
import type { PlatformApiService } from './api/service.js'
import cookie from '@fastify/cookie'
import { registerAuthRoutes, type AuthServiceLike } from './auth/routes.js'
import { registerAdminRoutes } from './admin/routes.js'
import { registerPolicyRoutes } from './policies/routes.js'
import { registerEmailPreviewRoutes } from './email/preview-routes.js'
import type { AdminService } from './admin/service.js'
import type { ApiError, ApiSuccess } from './contracts/api.js'
import { assertTrustedOrigin } from './security/origin.js'
import { verifyCsrfToken } from './security/csrf.js'
import { enforceRateLimit } from './security/rate-limit.js'

const API_PREFIX = '/api/v1'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const MAX_API_URL_LENGTH = 4_096

class AppSecurityError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'AppSecurityError'
    this.statusCode = statusCode
    this.code = code
  }
}

type AppOptions = {
  checkDatabase?: () => Promise<boolean>
  checkRedis?: () => Promise<boolean>
  redisRequired?: boolean
  logging?: boolean
  realtimeGateway?: RealtimeGateway
  authService?: AuthServiceLike
  apiService?: PlatformApiService
  marketDataService?: import('./market/service.js').MarketDataServiceLike
  tradingService?: import('./api/routes.js').TradingServiceLike
  adminService?: AdminService
}

function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value

  if (candidate && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate
  }

  return randomUUID()
}

function successResponse<T>(request: FastifyRequest, data: T): ApiSuccess<T> {
  return {
    success: true,
    data,
    requestId: request.id,
  }
}

export function buildApp(options: AppOptions = {}) {
  const realtimeGateway = options.realtimeGateway ?? new RealtimeGateway()

  const app = Fastify({
    logger: options.logging === false ? false : { level: env.logLevel },
    bodyLimit: env.bodyLimitBytes,
    requestTimeout: env.requestTimeoutMs,
    trustProxy: env.trustProxy,
    genReqId: (request) => resolveRequestId(request.headers['x-request-id']),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  })

  app.register(cookie)

  realtimeGateway.register(app)

  app.register(cors, {
    credentials: true,
    origin: env.corsOrigins,
  })

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith(API_PREFIX)) return
    if (request.url.length > MAX_API_URL_LENGTH) {
      throw new AppSecurityError(414, 'URI_TOO_LONG', 'Request URL is too long')
    }

    const path = request.url.split('?', 1)[0] ?? ''
    if (request.method === 'OPTIONS') return

    const isAuthRoute = path.startsWith(API_PREFIX + '/auth/')
    const isTradingRoute = path.startsWith(API_PREFIX + '/trades') || path.startsWith(API_PREFIX + '/wallet') || path.startsWith(API_PREFIX + '/payments')
    // Payment providers call this server-to-server: there is no browser origin, session cookie or CSRF
    // token. The adapter verifies the provider's own signature on the raw body instead.
    const isPaymentWebhook = path.startsWith(API_PREFIX + '/payments/webhooks/')
    const isUnsafe = !SAFE_METHODS.has(request.method) && !isPaymentWebhook
    // Authentication reads such as /auth/me are normal dashboard reads. Reserve the
    // stricter auth bucket for state-changing authentication operations.
    const isAuthMutation = isAuthRoute && isUnsafe
    // Read-heavy trading/wallet dashboards should use the general read quota.
    // Reserve the stricter trading bucket for state-changing trade/wallet requests.
    const isTradingMutation = isTradingRoute && isUnsafe

    if (isUnsafe) {
      assertTrustedOrigin(request)

      const contentType = request.headers['content-type']
      const normalizedContentType = Array.isArray(contentType) ? contentType[0] : contentType
      if (normalizedContentType?.toLowerCase().startsWith('multipart/form-data')) {
        throw new AppSecurityError(415, 'FILE_UPLOAD_NOT_SUPPORTED', 'File uploads are not enabled on this API endpoint')
      }
      if (normalizedContentType && !normalizedContentType.toLowerCase().startsWith('application/json')) {
        throw new AppSecurityError(415, 'UNSUPPORTED_CONTENT_TYPE', 'State-changing API requests must use application/json')
      }

      const sessionToken = request.cookies?.[env.auth.cookieName]
      const csrfHeader = request.headers['x-csrf-token']
      const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader
      if (!verifyCsrfToken(csrfToken, sessionToken)) {
        throw new AppSecurityError(403, 'CSRF_INVALID', 'CSRF validation failed')
      }
    }

    await enforceRateLimit({
      key: (isPaymentWebhook ? 'webhook:' : isAuthMutation ? 'auth:' : isTradingMutation ? 'trading:' : 'api:') + request.ip,
      limit: isAuthMutation ? env.security.rateLimit.authLimit : isTradingMutation ? env.security.rateLimit.tradingLimit : env.security.rateLimit.generalLimit,
      windowSeconds: isAuthMutation ? env.security.rateLimit.authWindowSeconds : isTradingMutation ? env.security.rateLimit.tradingWindowSeconds : env.security.rateLimit.generalWindowSeconds,
    })
  })

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
    reply.header('cache-control', 'no-store')
    const path = request.url.split('?', 1)[0] ?? ''
    const isLocalEmailPreview = env.nodeEnv === 'development' && path.startsWith('/api/v1/dev/email-previews')
    reply.header('content-security-policy', isLocalEmailPreview
      ? "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    reply.header('cross-origin-opener-policy', 'same-origin')
    reply.header('cross-origin-resource-policy', 'same-origin')
    reply.header('x-permitted-cross-domain-policies', 'none')

    if (env.nodeEnv === 'production') {
      reply.header(
        'strict-transport-security',
        'max-age=31536000; includeSubDomains',
      )
    }
  })

  // Register public policy metadata after global security and response hooks.
  registerPolicyRoutes(app)

  // Email previews are available only in local development and only to loopback clients.
  if (env.nodeEnv === 'development') registerEmailPreviewRoutes(app)

  if (options.authService) {
    registerAuthRoutes(app, options.authService)
  }

  if (options.authService && options.adminService) {
    registerAdminRoutes(app, { authService: options.authService, adminService: options.adminService, checkDatabase: options.checkDatabase, checkRedis: options.checkRedis })
  }

  if (options.authService && options.apiService) {
    registerPlatformApiRoutes(app, {
      authService: options.authService,
      apiService: options.apiService,
      marketDataService: options.marketDataService,
      tradingService: options.tradingService,
    })
  }

  app.get(API_PREFIX + '/health', async (request) =>
    successResponse(request, {
      service: 'slspot-api',
      version: 'v1',
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  )

  app.get(API_PREFIX + '/ready', async (request, reply) => {
    const databaseReady = options.checkDatabase
      ? await options.checkDatabase().catch(() => false)
      : true
    const redisConnected = options.checkRedis
      ? await options.checkRedis().catch(() => false)
      : false
    const redisReady = redisConnected || options.redisRequired !== true
    const ready = databaseReady && redisReady

    const response = successResponse(request, {
      status: ready ? 'ready' : 'not_ready',
      checks: {
        process: 'ready',
        database: databaseReady ? 'ready' : 'unavailable',
        redis: redisConnected
          ? 'ready'
          : options.redisRequired
            ? 'unavailable'
            : 'optional_unavailable',
      },
    })

    return reply.status(ready ? 200 : 503).send(response)
  })

  app.setNotFoundHandler((request, reply) => {
    const response: ApiError = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route ' + request.method + ' ' + request.url + ' was not found',
      },
      requestId: request.id,
    }

    return reply.status(404).send(response)
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'Request failed')

    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500

    const response: ApiError = {
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : (error.code ?? 'REQUEST_ERROR'),
        message:
          statusCode === 500
            ? 'An unexpected server error occurred'
            : error.message,
      },
      requestId: request.id,
    }

    const retryAfterSeconds = (error as FastifyError & { retryAfterSeconds?: number }).retryAfterSeconds
    if (retryAfterSeconds !== undefined) reply.header('retry-after', String(Math.ceil(retryAfterSeconds)))
    return reply.status(statusCode).send(response)
  })

  return app
}
