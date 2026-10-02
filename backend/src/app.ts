import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './config/env.js'

const API_PREFIX = '/api/v1'

type ErrorResponse = {
  success: false
  error: {
    code: string
    message: string
  }
}

export function buildApp() {
  const app = Fastify({ logger: true })

  app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin is not allowed by CORS'), false)
    },
  })

  app.get(API_PREFIX + '/health', async () => ({
    success: true,
    service: 'slspot-api',
    version: 'v1',
    timestamp: new Date().toISOString(),
  }))

  app.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route ' + request.method + ' ' + request.url + ' was not found',
      },
    }

    return reply.status(404).send(response)
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)

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
    }

    return reply.status(statusCode).send(response)
  })

  return app
}
