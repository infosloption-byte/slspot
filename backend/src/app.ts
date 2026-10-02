import { randomUUID } from 'node:crypto'
import Fastify, { LogController, type FastifyError, type FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'
import { RealtimeGateway } from './realtime/gateway.js'
import { registerPlatformApiRoutes } from './api/routes.js'
import type { PlatformApiService } from './api/service.js'
import cookie from '@fastify/cookie'
import { registerAuthRoutes, type AuthServiceLike } from './auth/routes.js'
import type { ApiError, ApiSuccess } from './contracts/api.js'

const API_PREFIX = '/api/v1'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

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

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
    reply.header('cache-control', 'no-store')

    if (env.nodeEnv === 'production') {
      reply.header(
        'strict-transport-security',
        'max-age=31536000; includeSubDomains',
      )
    }
  })

  if (options.authService) {
    registerAuthRoutes(app, options.authService)
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

    return reply.status(statusCode).send(response)
  })

  return app
}
