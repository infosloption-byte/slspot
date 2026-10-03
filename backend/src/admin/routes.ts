import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AuthError, type AuthSession } from '../auth/service.js'
import type { AuthServiceLike } from '../auth/routes.js'
import { env } from '../config/env.js'
import { AdminError, AdminService, type AdminStatus } from './service.js'

const PREFIX = '/api/v1/admin'
const STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const
const TRADE_STATUSES = ['OPEN', 'WON', 'LOST', 'CANCELLED', 'EXPIRED'] as const
const SETTLEMENT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const
const FUNDING_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED'] as const
const MARKET_STATUSES = ['OPEN', 'CLOSED', 'HALTED', 'MAINTENANCE'] as const
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}
type Query = { page?: string; pageSize?: string; search?: string; status?: string; action?: string; entityType?: string; mode?: string }

function positive(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Pagination values must be positive integers')
  return parsed
}

function enumValue(value: string | undefined, allowed: readonly string[], name: string) {
  if (value === undefined || allowed.includes(value)) return value
  throw new AuthError(400, 'INVALID_QUERY', name + ' is invalid')
}

async function requireAdmin(request: FastifyRequest, authService: AuthServiceLike, adminService: AdminService, requiredRole: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN'): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  await adminService.requireAdmin(session.id, requiredRole)
  return session
}

function ok<T>(request: FastifyRequest, data: T) { return { success: true as const, data, requestId: request.id } }

export function registerAdminRoutes(app: FastifyInstance, options: { authService: AuthServiceLike; adminService: AdminService; checkDatabase?: () => Promise<boolean>; checkRedis?: () => Promise<boolean> }) {
  app.get(PREFIX + '/me', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.getMe(session.id))
  })

  app.get(PREFIX + '/dashboard', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    const [database, redis] = await Promise.all([
      options.checkDatabase ? options.checkDatabase().catch(() => false) : Promise.resolve(true),
      options.checkRedis ? options.checkRedis().catch(() => false) : Promise.resolve(false),
    ])
    return ok(request, await options.adminService.dashboard({ database, redis }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/users', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listUsers({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), search: request.query.search?.trim() || undefined, status: enumValue(request.query.status, STATUSES, 'User status') as AdminStatus | undefined }))
  })

  app.get<{ Params: { userId: string } }>(PREFIX + '/users/:userId', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.getUser(request.params.userId))
  })

  app.post<{ Params: { userId: string }; Body: { status: AdminStatus } }>(PREFIX + '/users/:userId/status', {
    schema: {
      params: userIdParams,
      body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: { status: { type: 'string', enum: [...STATUSES] } },
      },
    },
  }, async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    if (!STATUSES.includes(request.body.status)) throw new AuthError(400, 'INVALID_STATUS', 'User status is invalid')
    return ok(request, await options.adminService.setUserStatus(session.id, request.params.userId, request.body.status))
  })

  app.post<{ Params: { userId: string } }>(PREFIX + '/users/:userId/revoke-sessions', { schema: { params: userIdParams } }, async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.revokeUserSessions(session.id, request.params.userId))
  })

  app.post<{ Params: { userId: string }; Body: { role: 'ADMIN' | 'SUPER_ADMIN' } }>(PREFIX + '/users/:userId/role', {
    schema: {
      params: userIdParams,
      body: {
        type: 'object',
        required: ['role'],
        additionalProperties: false,
        properties: { role: { type: 'string', enum: [...ADMIN_ROLES] } },
      },
    },
  }, async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService, 'SUPER_ADMIN')
    return ok(request, await options.adminService.setAdminRole(session.id, request.params.userId, request.body.role))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/trades', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listTrades({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), search: request.query.search?.trim() || undefined, status: enumValue(request.query.status, TRADE_STATUSES, 'Trade status') }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/positions', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listPositions({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), openOnly: true }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/settlements', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listSettlements({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, SETTLEMENT_STATUSES, 'Settlement status') }))
  })

  app.get(PREFIX + '/assets', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listAssets())
  })

  app.post<{ Params: { assetId: string }; Body: { isActive: boolean } }>(PREFIX + '/assets/:assetId/status', {
    schema: {
      params: assetIdParams,
      body: {
        type: 'object',
        required: ['isActive'],
        additionalProperties: false,
        properties: { isActive: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.setAssetActive(session.id, request.params.assetId, request.body.isActive))
  })

  app.post<{ Params: { marketId: string }; Body: { status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE' } }>(PREFIX + '/markets/:marketId/status', {
    schema: {
      params: marketIdParams,
      body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: { status: { type: 'string', enum: [...MARKET_STATUSES] } },
      },
    },
  }, async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    if (!MARKET_STATUSES.includes(request.body.status)) throw new AuthError(400, 'INVALID_STATUS', 'Market status is invalid')
    return ok(request, await options.adminService.setMarketStatus(session.id, request.params.marketId, request.body.status))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/wallets', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listWallets({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), mode: enumValue(request.query.mode, ['DEMO', 'REAL'], 'Wallet mode') as 'DEMO' | 'REAL' | undefined }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/deposits', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listDeposits({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, FUNDING_STATUSES, 'Funding status') }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/withdrawals', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listWithdrawals({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, FUNDING_STATUSES, 'Funding status') }))
  })

  app.get(PREFIX + '/finance/reconciliation', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.reconciliation())
  })

  app.get<{ Querystring: Query }>(PREFIX + '/ledger', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listLedger({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25) }))
  })

  app.get(PREFIX + '/risk', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.risk())
  })

  app.get<{ Querystring: Query }>(PREFIX + '/audit', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listAudit({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), action: request.query.action?.trim() || undefined, entityType: request.query.entityType?.trim() || undefined }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/security-events', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listSecurityEvents({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25) }))
  })

  app.get(PREFIX + '/export/audit', async (request, reply) => {
    await requireAdmin(request, options.authService, options.adminService)
    const result = await options.adminService.listAudit({ page: 1, pageSize: 5000 })
    reply.header('content-type', 'application/json; charset=utf-8')
    return reply.send(result.items)
  })
}

export function isAdminError(error: unknown): error is AdminError {
  return error instanceof AdminError
}

const userIdParams = {
  type: 'object',
  required: ['userId'],
  additionalProperties: false,
  properties: { userId: { type: 'string', pattern: UUID_PATTERN } },
} as const
const assetIdParams = {
  type: 'object',
  required: ['assetId'],
  additionalProperties: false,
  properties: { assetId: { type: 'string', pattern: UUID_PATTERN } },
} as const
const marketIdParams = {
  type: 'object',
  required: ['marketId'],
  additionalProperties: false,
  properties: { marketId: { type: 'string', pattern: UUID_PATTERN } },
} as const

type Query = { page?: string; pageSize?: string; search?: string; status?: string; action?: string; entityType?: string; mode?: string }

function positive(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Pagination values must be positive integers')
  return parsed
}

function enumValue(value: string | undefined, allowed: readonly string[], name: string) {
  if (value === undefined || allowed.includes(value)) return value
  throw new AuthError(400, 'INVALID_QUERY', name + ' is invalid')
}

async function requireAdmin(request: FastifyRequest, authService: AuthServiceLike, adminService: AdminService): Promise<AuthSession> {
  const session = await authService.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication is required')
  await adminService.requireAdmin(session.id)
  return session
}

function ok<T>(request: FastifyRequest, data: T) { return { success: true as const, data, requestId: request.id } }

export function registerAdminRoutes(app: FastifyInstance, options: { authService: AuthServiceLike; adminService: AdminService; checkDatabase?: () => Promise<boolean>; checkRedis?: () => Promise<boolean> }) {
  app.get(PREFIX + '/me', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.getMe(session.id))
  })

  app.get(PREFIX + '/dashboard', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    const [database, redis] = await Promise.all([
      options.checkDatabase ? options.checkDatabase().catch(() => false) : Promise.resolve(true),
      options.checkRedis ? options.checkRedis().catch(() => false) : Promise.resolve(false),
    ])
    return ok(request, await options.adminService.dashboard({ database, redis }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/users', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listUsers({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), search: request.query.search?.trim() || undefined, status: enumValue(request.query.status, STATUSES, 'User status') as AdminStatus | undefined }))
  })

  app.get<{ Params: { userId: string } }>(PREFIX + '/users/:userId', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.getUser(request.params.userId))
  })

  app.post<{ Params: { userId: string }; Body: { status: AdminStatus } }>(PREFIX + '/users/:userId/status', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    if (!STATUSES.includes(request.body.status)) throw new AuthError(400, 'INVALID_STATUS', 'User status is invalid')
    return ok(request, await options.adminService.setUserStatus(session.id, request.params.userId, request.body.status))
  })

  app.post<{ Params: { userId: string } }>(PREFIX + '/users/:userId/revoke-sessions', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.revokeUserSessions(session.id, request.params.userId))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/trades', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listTrades({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), search: request.query.search?.trim() || undefined, status: enumValue(request.query.status, TRADE_STATUSES, 'Trade status') }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/positions', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listPositions({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), openOnly: true }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/settlements', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listSettlements({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, SETTLEMENT_STATUSES, 'Settlement status') }))
  })

  app.get(PREFIX + '/assets', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listAssets())
  })

  app.post<{ Params: { assetId: string }; Body: { isActive: boolean } }>(PREFIX + '/assets/:assetId/status', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.setAssetActive(session.id, request.params.assetId, Boolean(request.body.isActive)))
  })

  app.post<{ Params: { marketId: string }; Body: { status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE' } }>(PREFIX + '/markets/:marketId/status', async (request) => {
    const session = await requireAdmin(request, options.authService, options.adminService)
    if (!MARKET_STATUSES.includes(request.body.status)) throw new AuthError(400, 'INVALID_STATUS', 'Market status is invalid')
    return ok(request, await options.adminService.setMarketStatus(session.id, request.params.marketId, request.body.status))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/wallets', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listWallets({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), mode: enumValue(request.query.mode, ['DEMO', 'REAL'], 'Wallet mode') as 'DEMO' | 'REAL' | undefined }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/deposits', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listDeposits({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, FUNDING_STATUSES, 'Funding status') }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/withdrawals', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listWithdrawals({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), status: enumValue(request.query.status, FUNDING_STATUSES, 'Funding status') }))
  })

  app.get(PREFIX + '/finance/reconciliation', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.reconciliation())
  })

  app.get<{ Querystring: Query }>(PREFIX + '/ledger', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listLedger({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25) }))
  })

  app.get(PREFIX + '/risk', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.risk())
  })

  app.get<{ Querystring: Query }>(PREFIX + '/audit', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listAudit({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25), action: request.query.action?.trim() || undefined, entityType: request.query.entityType?.trim() || undefined }))
  })

  app.get<{ Querystring: Query }>(PREFIX + '/security-events', async (request) => {
    await requireAdmin(request, options.authService, options.adminService)
    return ok(request, await options.adminService.listSecurityEvents({ page: positive(request.query.page, 1), pageSize: positive(request.query.pageSize, 25) }))
  })

  app.get(PREFIX + '/export/audit', async (request, reply) => {
    await requireAdmin(request, options.authService, options.adminService)
    const result = await options.adminService.listAudit({ page: 1, pageSize: 5000 })
    reply.header('content-type', 'application/json; charset=utf-8')
    return reply.send(result.items)
  })
}

export function isAdminError(error: unknown): error is AdminError {
  return error instanceof AdminError
}
