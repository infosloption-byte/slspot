import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthSession } from '../auth/service.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { env } from '../config/env.js'
import { PlatformApiService } from './service.js'
import { isCandleInterval } from '../market/types.js'
import type { MarketDataServiceLike } from '../market/service.js'

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

function queryEnum(value: string | undefined, allowed: readonly string[], name: string): string | undefined {
  if (value === undefined || allowed.includes(value)) return value
  throw new AuthError(400, 'INVALID_QUERY', name + ' is invalid')
}

const ASSET_TYPES = ['CRYPTO', 'FOREX', 'STOCK', 'COMMODITY', 'INDEX', 'OTHER'] as const
const TRADE_STATUSES = ['OPEN', 'WON', 'LOST', 'CANCELLED', 'EXPIRED'] as const

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
  marketDataService?: MarketDataServiceLike
}

export function registerPlatformApiRoutes(app: FastifyInstance, options: PlatformApiOptions): void {
  app.get<{ Querystring: Query }>(PREFIX + '/market/assets', async (request) => {
    return ok(request, await options.apiService.listAssets({
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      type: queryEnum(request.query.type, ASSET_TYPES, 'Asset type'),
    }))
  })

  app.get<{ Params: { assetId: string }; Querystring: Query & { interval?: string; limit?: string } }>(
    PREFIX + '/market/assets/:assetId/candles',
    async (request) => {
      if (!options.marketDataService) throw new AuthError(503, 'MARKET_DATA_UNAVAILABLE', 'Market data service is unavailable')
      const interval = request.query.interval ?? '5min'
      if (!isCandleInterval(interval)) throw new AuthError(400, 'INVALID_QUERY', 'Chart interval is invalid')
      const limit = queryNumber(request.query.limit)
      if (limit !== undefined && limit > 5000) throw new AuthError(400, 'INVALID_QUERY', 'Candle limit must not exceed 5000')
      return ok(request, await options.marketDataService.getCandles(request.params.assetId, interval, limit ?? 200))
    },
  )

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
      status: queryEnum(request.query.status, TRADE_STATUSES, 'Trade status'),
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
