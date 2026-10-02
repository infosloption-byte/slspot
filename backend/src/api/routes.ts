import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthServiceLike } from '../auth/service.js'
import type { AuthSession } from '../auth/service.js'
import { env } from '../config/env.js'
import { PlatformApiService } from './service.js'

const PREFIX = '/api/v1'

type Query = {
  page?: string
  pageSize?: string
  type?: string
  status?: string
  unreadOnly?: string
}

function queryNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new AuthError(400, 'INVALID_QUERY', 'Pagination values must be positive integers')
  }
  return number
}

function queryBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new AuthError(400, 'INVALID_QUERY', 'Boolean query values must be true or false')
}

async function requireSession(request: FastifyRequest, authService: AuthServiceLike): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  return session
}

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true as const, data, requestId: request.id }
}

export type PlatformApiOptions = {
  authService: AuthServiceLike
  apiService: PlatformApiService
}

export function registerPlatformApiRoutes(app: FastifyInstance, options: PlatformApiOptions): void {
  app.get<{ Querystring: Query }>(PREFIX + '/market/assets', async (request) => {
    return ok(request, await options.apiService.listAssets({
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      type: request.query.type,
    }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/portfolio/summary', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getPortfolioSummary(session.id))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/portfolio/positions', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.listPositions(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
    }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/trades', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.listTrades(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      status: request.query.status,
    }))
  })

  app.get(PREFIX + '/wallet', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getWallet(session.id))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/wallet/transactions', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.listWalletTransactions(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
    }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/notifications', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.listNotifications(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      unreadOnly: queryBoolean(request.query.unreadOnly),
    }))
  })

  app.post<{ Params: { notificationId: string } }>(
    PREFIX + '/notifications/:notificationId/read',
    async (request) => {
      const session = await requireSession(request, options.authService)
      const read = await options.apiService.markNotificationRead(session.id, request.params.notificationId)
      if (!read) {
        throw new AuthError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found')
      }
      return ok(request, { read: true })
    },
  )
}
