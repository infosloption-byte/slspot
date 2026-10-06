import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthSession } from '../auth/service.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { env } from '../config/env.js'
import { PlatformApiService } from './service.js'
import { isCandleInterval } from '../market/types.js'
import type { MarketDataServiceLike } from '../market/service.js'
import type { TradingService } from '../trading/service.js'
import type { WalletMode } from './service.js'
import { FinanceError } from './service.js'

const PREFIX = '/api/v1'

type Query = {
  page?: string
  pageSize?: string
  type?: string
  status?: string
  unreadOnly?: string
  direction?: string
  assetId?: string
  search?: string
  from?: string
  to?: string
  sortBy?: string
  sortOrder?: string
  settledOnly?: string
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

function queryEnumList(value: string | undefined, allowed: readonly string[], name: string): string[] | undefined {
  if (value === undefined) return undefined
  const values = value.split(',').map((item) => item.trim()).filter(Boolean)
  if (values.length === 0 || values.some((item) => !allowed.includes(item))) {
    throw new AuthError(400, 'INVALID_QUERY', name + ' is invalid')
  }
  return values
}

function queryDate(value: string | undefined, name: string, endOfDay = false): Date | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(normalized)
    ? new Date(normalized + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'))
    : new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new AuthError(400, 'INVALID_QUERY', name + ' must be a valid date')
  }
  return date
}

const ASSET_TYPES = ['CRYPTO', 'FOREX', 'STOCK', 'COMMODITY', 'INDEX', 'OTHER'] as const
const TRADE_STATUSES = ['OPEN', 'WON', 'LOST', 'DRAW', 'CANCELLED', 'EXPIRED'] as const
const WALLET_MODES = ['DEMO', 'REAL'] as const
const WALLET_TRANSACTION_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRADE_HOLD', 'TRADE_RELEASE', 'SETTLEMENT', 'FEE', 'ADJUSTMENT'] as const
const WALLET_TRANSACTION_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED'] as const

async function requireSession(request: FastifyRequest, authService: AuthServiceLike): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  return session
}

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true as const, data, requestId: request.id }
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'

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
    return ok(request, await options.apiService.getPortfolioSummary(session.id, walletModeFromRequest(request)))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/portfolio/analytics', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getPortfolioAnalytics(session.id, walletModeFromRequest(request)))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/portfolio/positions', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.listPositions(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
    }, walletModeFromRequest(request)))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/trades', async (request) => {
    const session = await requireSession(request, options.authService)
    const from = queryDate(request.query.from, 'From date')
    const to = queryDate(request.query.to, 'To date', true)
    if (from && to && from.getTime() > to.getTime()) {
      throw new AuthError(400, 'INVALID_QUERY', 'From date must not be after to date')
    }

    return ok(request, await options.apiService.listTrades(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      statuses: queryEnumList(request.query.status, TRADE_STATUSES, 'Trade status') as Array<typeof TRADE_STATUSES[number]> | undefined,
      direction: queryEnum(request.query.direction, ['UP', 'DOWN'], 'Trade direction') as 'UP' | 'DOWN' | undefined,
      assetId: request.query.assetId?.trim() || undefined,
      search: request.query.search?.trim() || undefined,
      from,
      to,
      sortBy: queryEnum(request.query.sortBy, ['openedAt', 'closedAt', 'amount', 'netPnl'], 'Trade sort') as 'openedAt' | 'closedAt' | 'amount' | 'netPnl' | undefined,
      sortOrder: queryEnum(request.query.sortOrder, ['asc', 'desc'], 'Trade sort order') as 'asc' | 'desc' | undefined,
      settledOnly: queryBoolean(request.query.settledOnly),
    }, walletModeFromRequest(request)))
  })

  app.post<{
    Body: {
      assetId: string
      direction: 'UP' | 'DOWN'
      amount: string | number
      durationSeconds: number
      clientRequestId?: string
    }
  }>(PREFIX + '/trades', {
    schema: {
      body: {
        type: 'object',
        required: ['assetId', 'direction', 'amount', 'durationSeconds'],
        additionalProperties: false,
        properties: {
          assetId: { type: 'string', minLength: 1, maxLength: 64 },
          direction: { type: 'string', enum: ['UP', 'DOWN'] },
          amount: { anyOf: [{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'number', exclusiveMinimum: 0 }] },
          durationSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
          clientRequestId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const session = await requireSession(request, options.authService)
    const clientRequestId = idempotencyKeyFromRequest(request, request.body.clientRequestId)
    if (!options.tradingService) {
      throw new AuthError(503, 'TRADING_UNAVAILABLE', 'Trading service is unavailable')
    }

    return ok(request, await options.tradingService.createTrade(session.id, {
      assetId: request.body.assetId,
      direction: request.body.direction,
      amount: String(request.body.amount),
      durationSeconds: request.body.durationSeconds,
      clientRequestId,
    }, walletModeFromRequest(request)))
  })

  app.post<{ Params: { tradeId: string } }>(PREFIX + '/trades/:tradeId/close', {
    schema: {
      params: {
        type: 'object',
        required: ['tradeId'],
        additionalProperties: false,
        properties: { tradeId: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request) => {
    const session = await requireSession(request, options.authService)
    if (!options.tradingService) {
      throw new AuthError(503, 'TRADING_UNAVAILABLE', 'Trading service is unavailable')
    }
    return ok(request, await options.tradingService.closeTrade(session.id, request.params.tradeId, walletModeFromRequest(request)))
  })

  app.post<{ Params: { tradeId: string } }>(PREFIX + '/trades/:tradeId/cancel', {
    schema: {
      params: {
        type: 'object',
        required: ['tradeId'],
        additionalProperties: false,
        properties: { tradeId: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request) => {
    const session = await requireSession(request, options.authService)
    if (!options.tradingService) {
      throw new AuthError(503, 'TRADING_UNAVAILABLE', 'Trading service is unavailable')
    }
    return ok(request, await options.tradingService.cancelTrade(session.id, request.params.tradeId, walletModeFromRequest(request)))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/ledger/reconcile', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.reconcileWallet(session.id, walletModeFromRequest(request)))
  })

  app.get(PREFIX + '/auth/capabilities', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getCapabilities(session.id))
  })

  app.get(PREFIX + '/wallets', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getWallets(session.id))
  })

  app.get(PREFIX + '/wallet', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, await options.apiService.getWallet(session.id, walletModeFromRequest(request)))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/wallet/transactions', async (request) => {
    const session = await requireSession(request, options.authService)
    const from = queryDate(request.query.from, 'From date')
    const to = queryDate(request.query.to, 'To date', true)
    if (from && to && from.getTime() > to.getTime()) {
      throw new AuthError(400, 'INVALID_QUERY', 'From date must not be after to date')
    }
    return ok(request, await options.apiService.listWalletTransactions(session.id, {
      page: queryNumber(request.query.page),
      pageSize: queryNumber(request.query.pageSize),
      types: queryEnumList(request.query.type, WALLET_TRANSACTION_TYPES, 'Wallet transaction type') as Array<typeof WALLET_TRANSACTION_TYPES[number]> | undefined,
      statuses: queryEnumList(request.query.status, WALLET_TRANSACTION_STATUSES, 'Wallet transaction status') as Array<typeof WALLET_TRANSACTION_STATUSES[number]> | undefined,
      search: request.query.search?.trim() || undefined,
      from,
      to,
    }, walletModeFromRequest(request)))
  })

  app.post<{
    Body: { amount: string | number; clientRequestId?: string }
  }>(PREFIX + '/wallet/deposit', {
    schema: {
      body: {
        type: 'object',
        required: ['amount'],
        additionalProperties: false,
        properties: {
          amount: { anyOf: [{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'number', exclusiveMinimum: 0 }] },
          clientRequestId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const session = await requireSession(request, options.authService)
    const mode = walletModeFromRequest(request)
    if (mode !== 'DEMO') throw new FinanceError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Real deposits are not enabled')
    const clientRequestId = idempotencyKeyFromRequest(request, request.body.clientRequestId)
    return ok(request, await options.apiService.createDemoDeposit(session.id, {
      amount: String(request.body.amount),
      clientRequestId,
    }))
  })

  app.post<{
    Body: { amount: string | number; destination: string; clientRequestId?: string }
  }>(PREFIX + '/wallet/withdraw', {
    schema: {
      body: {
        type: 'object',
        required: ['amount', 'destination'],
        additionalProperties: false,
        properties: {
          amount: { anyOf: [{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'number', exclusiveMinimum: 0 }] },
          destination: { type: 'string', minLength: 1, maxLength: 255 },
          clientRequestId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const session = await requireSession(request, options.authService)
    const mode = walletModeFromRequest(request)
    if (mode !== 'DEMO') throw new FinanceError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Real withdrawals are not enabled')
    const clientRequestId = idempotencyKeyFromRequest(request, request.body.clientRequestId)
    return ok(request, await options.apiService.createDemoWithdrawal(session.id, {
      amount: String(request.body.amount),
      destination: request.body.destination,
      clientRequestId,
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

  app.post(PREFIX + '/notifications/read-all', async (request) => {
    const session = await requireSession(request, options.authService)
    return ok(request, { updated: await options.apiService.markAllNotificationsRead(session.id) })
  })

  app.post<{ Params: { notificationId: string } }>(
    PREFIX + '/notifications/:notificationId/read',
    {
      schema: {
        params: {
          type: 'object',
          required: ['notificationId'],
          additionalProperties: false,
          properties: { notificationId: { type: 'string', pattern: UUID_PATTERN } },
        },
      },
    },
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


function idempotencyKeyFromRequest(request: FastifyRequest, bodyValue?: string): string {
  const headerValue = request.headers['idempotency-key']
  const headerKey = Array.isArray(headerValue) ? headerValue[0] : headerValue
  const value = (bodyValue ?? headerKey)?.trim() ?? ''
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new AuthError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must contain 1-128 safe characters')
  }
  if (bodyValue && headerKey && bodyValue.trim() !== headerKey.trim()) {
    throw new AuthError(400, 'IDEMPOTENCY_KEY_MISMATCH', 'Body and header idempotency keys must match')
  }
  return value
}

function walletModeFromRequest(request: FastifyRequest): WalletMode {
  const raw = request.headers['x-wallet-mode']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined) return 'DEMO'
  if (!WALLET_MODES.includes(value as WalletMode)) throw new AuthError(400, 'INVALID_QUERY', 'Wallet mode is invalid')
  return value as WalletMode
}

export type TradingServiceLike = Pick<TradingService, 'createTrade' | 'closeTrade' | 'cancelTrade'>

export type PlatformApiOptions = {
  authService: AuthServiceLike
  apiService: PlatformApiService
  marketDataService?: MarketDataServiceLike
  tradingService?: TradingServiceLike
}

