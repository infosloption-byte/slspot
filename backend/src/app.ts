import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'

const API_PREFIX = '/api/v1'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

type ErrorResponse = {
  success: false
  error: {
    code: string
    message: string
  }
  requestId: string
}

type SuccessResponse<T> = {
  success: true
  data: T
  requestId: string
}

function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value

  if (candidate && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate
  }

  return randomUUID()
}

function successResponse<T>(request: FastifyRequest, data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    requestId: request.id,
  }
}

export function buildApp() {
  const app = Fastify({
    logger: { level: env.logLevel },
    bodyLimit: env.bodyLimitBytes,
    requestTimeout: env.requestTimeoutMs,
    trustProxy: env.trustProxy,
    requestIdHeader: 'x-request-id',
    genReqId: (request) => resolveRequestId(request.headers['x-request-id']),
    requestIdLogLabel: 'requestId',
  })

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

  app.get(API_PREFIX + '/health', async (request) =>
    successResponse(request, {
      service: 'slspot-api',
      version: 'v1',
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  )

  app.get(API_PREFIX + '/ready', async (request) =>
    successResponse(request, {
      status: 'ready',
      checks: {
        process: 'ready',
      },
    }),
  )

  app.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route ' + request.method + ' ' + request.url + ' was not found',
      },
      requestId: request.id,
    }

    return reply.status(404).send(response)
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'Request failed')

    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500

    const response: ErrorResponse = {
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
