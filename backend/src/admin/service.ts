import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { getTradingRules } from '../trading/config.js'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

function paging(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(DEFAULT_PAGE, Math.floor(page ?? DEFAULT_PAGE))
  const normalizedSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)))
  return {
    page: normalizedPage,
    pageSize: normalizedSize,
    skip: (normalizedPage - 1) * normalizedSize,
  }
}

function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export class AdminError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'AdminError'
    this.statusCode = statusCode
    this.code = code
  }
}

export type AdminStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED'

export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async bootstrapConfiguredAdmins(): Promise<number> {
    if (env.adminBootstrapEmails.length === 0) return 0
    let created = 0
    for (const email of env.adminBootstrapEmails) {
      const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (!user) continue
      const existing = await this.prisma.adminAccess.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (existing) continue
      await this.prisma.adminAccess.create({ data: { userId: user.id, role: 'ADMIN' } })
      created += 1
    }
    return created
  }

  async requireAdmin(userId: string) {
    const access = await this.prisma.adminAccess.findUnique({ where: { userId }, include: { user: { select: { id: true, email: true, status: true } } } })
    if (!access || access.user.status !== 'ACTIVE') {
      throw new AdminError(403, 'ADMIN_ACCESS_REQUIRED', 'Administrator access is required')
    }
    return access
  }

  async getMe(userId: string) {
    const access = await this.requireAdmin(userId)
    return { id: access.user.id, email: access.user.email, role: access.role }
  }

  async dashboard(input: { database: boolean; redis: boolean }) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [users, activeUsers, deposits, withdrawals, openTrades, volume, openExposure] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.deposit.aggregate({ where: { requestedAt: { gte: since } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.withdrawal.aggregate({ where: { requestedAt: { gte: since } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.trade.count({ where: { status: 'OPEN' } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: since }, status: { in: ['PENDING', 'ACCEPTED'] } }, _sum: { amount: true } }),
      this.prisma.position.aggregate({ where: { status: 'OPEN' }, _sum: { amount: true } }),
    ])
    return {
      metrics: {
        users,
        activeUsers,
        deposits: { count: deposits._count._all, amount: deposits._sum.amount?.toString() ?? '0' },
        withdrawals: { count: withdrawals._count._all, amount: withdrawals._sum.amount?.toString() ?? '0' },
        openTrades,
        volume24h: volume._sum.amount?.toString() ?? '0',
        openExposure: openExposure._sum.amount?.toString() ?? '0',
      },
      systemHealth: {
        database: input.database ? 'ready' : 'unavailable',
        redis: input.redis ? 'ready' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    }
  }

  async listUsers(input: { page?: number; pageSize?: number; search?: string; status?: AdminStatus }) {
    const p = paging(input.page, input.pageSize)
    const search = input.search?.trim()
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(search ? { OR: [{ email: { contains: search } }, { id: { contains: search } }, { countryCode: { contains: search } }] } : {}),
    }
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.pageSize,
        select: {
          id: true, email: true, status: true, countryCode: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true, twoFactorEnabled: true,
          adminAccess: { select: { role: true } },
          kycCases: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, updatedAt: true } },
          _count: { select: { sessions: true, accounts: true, trades: true } },
        },
      }),
    ])
    return pageResult(users.map((user) => ({
      ...user,
      kycStatus: user.kycCases[0]?.status ?? 'NOT_STARTED',
      kycCases: undefined,
    })), total, p.page, p.pageSize)
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, status: true, countryCode: true, createdAt: true, updatedAt: true, lastLoginAt: true, emailVerifiedAt: true, twoFactorEnabled: true, termsAcceptedAt: true, termsVersion: true,
        adminAccess: { select: { role: true, createdAt: true } },
        accounts: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, currency: true, mode: true, status: true, createdAt: true, wallets: { select: { id: true, currency: true, status: true, availableBalance: true, heldBalance: true } } },
        },
        kycCases: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, provider: true, providerCaseId: true, status: true, submittedAt: true, resolvedAt: true, createdAt: true, updatedAt: true } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, deviceId: true, ipAddress: true, userAgent: true, createdAt: true, updatedAt: true, expiresAt: true, revokedAt: true } },
      },
    })
    if (!user) throw new AdminError(404, 'USER_NOT_FOUND', 'User was not found')
    return {
      ...user,
      accounts: user.accounts.map((account) => ({ ...account, wallets: account.wallets.map((wallet) => ({ ...wallet, availableBalance: wallet.availableBalance.toString(), heldBalance: wallet.heldBalance.toString() })) })),
      kycCases: user.kycCases,
    }
  }

  async setUserStatus(actorUserId: string, userId: string, status: AdminStatus) {
    await this.requireAdmin(actorUserId)
    if (actorUserId === userId) throw new AdminError(400, 'SELF_STATUS_CHANGE', 'Administrators cannot change their own account status')
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status }, select: { id: true, email: true, status: true } }).catch(() => null)
    if (!user) throw new AdminError(404, 'USER_NOT_FOUND', 'User was not found')
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'ADMIN_USER_STATUS_CHANGED', entityType: 'User', entityId: userId, metadata: { status } } })
    return user
  }

  async revokeUserSessions(actorUserId: string, userId: string) {
    await this.requireAdmin(actorUserId)
    if (actorUserId === userId) throw new AdminError(400, 'SELF_SESSION_REVOKE', 'Administrators cannot revoke their own sessions from user management')
    const result = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.prisma.device.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'ADMIN_SESSIONS_REVOKED', entityType: 'User', entityId: userId, metadata: { count: result.count } } })
    return { revoked: result.count }
  }

  async listTrades(input: { page?: number; pageSize?: number; status?: string; search?: string }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.TradeWhereInput = {
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.search ? { OR: [{ id: { contains: input.search } }, { user: { email: { contains: input.search } } }, { position: { asset: { symbol: { contains: input.search } } } }] } : {}),
    }
    const [total, trades] = await this.prisma.$transaction([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: p.skip,
        take: p.pageSize,
        select: {
          id: true, status: true, grossPnl: true, fee: true, netPnl: true, openedAt: true, closedAt: true,
          user: { select: { id: true, email: true } },
          position: { select: { id: true, side: true, amount: true, entryPrice: true, exitPrice: true, asset: { select: { symbol: true, name: true } }, order: { select: { durationSeconds: true, payoutRate: true, expiresAt: true } } },
          },
        },
      }),
    ])
    return pageResult(trades.map((trade) => ({ ...trade, grossPnl: trade.grossPnl?.toString() ?? null, fee: trade.fee.toString(), netPnl: trade.netPnl?.toString() ?? null, position: { ...trade.position, amount: trade.position.amount.toString(), entryPrice: trade.position.entryPrice.toString(), exitPrice: trade.position.exitPrice?.toString() ?? null, payoutRate: trade.position.order.payoutRate.toString() } })), total, p.page, p.pageSize)
  }

  async listPositions(input: { page?: number; pageSize?: number; openOnly?: boolean }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.PositionWhereInput = { ...(input.openOnly ? { status: 'OPEN' } : {}) }
    const [total, positions] = await this.prisma.$transaction([
      this.prisma.position.count({ where }),
      this.prisma.position.findMany({
        where, orderBy: { openedAt: 'desc' }, skip: p.skip, take: p.pageSize,
        select: { id: true, status: true, side: true, amount: true, entryPrice: true, exitPrice: true, openedAt: true, closedAt: true, user: { select: { email: true } }, asset: { select: { symbol: true, name: true } } },
      }),
    ])
    return pageResult(positions.map((position) => ({ ...position, amount: position.amount.toString(), entryPrice: position.entryPrice.toString(), exitPrice: position.exitPrice?.toString() ?? null })), total, p.page, p.pageSize)
  }

  async listSettlements(input: { page?: number; pageSize?: number; status?: string }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.SettlementWhereInput = { ...(input.status ? { status: input.status as never } : {}) }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.settlement.count({ where }),
      this.prisma.settlement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, status: true, settlementPrice: true, grossPayout: true, fees: true, netPnl: true, referenceId: true, settledAt: true, createdAt: true, trade: { select: { id: true, status: true, user: { select: { email: true } }, position: { select: { asset: { select: { symbol: true } } } } } } } }),
    ])
    return pageResult(rows.map((row) => ({ ...row, settlementPrice: row.settlementPrice?.toString() ?? null, grossPayout: row.grossPayout?.toString() ?? null, fees: row.fees.toString(), netPnl: row.netPnl?.toString() ?? null })), total, p.page, p.pageSize)
  }

  async listAssets() {
    const assets = await this.prisma.asset.findMany({ orderBy: [{ sortOrder: 'asc' }, { symbol: 'asc' }], include: { markets: { orderBy: { updatedAt: 'desc' }, take: 1 } } })
    return assets.map((asset) => ({ ...asset, rules: getTradingRules(asset.symbol, asset.markets[0]?.status === 'OPEN'), markets: asset.markets.map((market) => ({ ...market, lastPrice: market.lastPrice?.toString() ?? null, lastChangePct: market.lastChangePct?.toString() ?? null, lastVolume: market.lastVolume?.toString() ?? null })) }))
  }

  async setAssetActive(actorUserId: string, assetId: string, isActive: boolean) {
    await this.requireAdmin(actorUserId)
    const asset = await this.prisma.asset.update({ where: { id: assetId }, data: { isActive }, select: { id: true, symbol: true, isActive: true } }).catch(() => null)
    if (!asset) throw new AdminError(404, 'ASSET_NOT_FOUND', 'Asset was not found')
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'ADMIN_ASSET_STATUS_CHANGED', entityType: 'Asset', entityId: assetId, metadata: { isActive } } })
    return asset
  }

  async setMarketStatus(actorUserId: string, marketId: string, status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE') {
    await this.requireAdmin(actorUserId)
    const market = await this.prisma.market.update({ where: { id: marketId }, data: { status }, select: { id: true, assetId: true, status: true } }).catch(() => null)
    if (!market) throw new AdminError(404, 'MARKET_NOT_FOUND', 'Market was not found')
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'ADMIN_MARKET_STATUS_CHANGED', entityType: 'Market', entityId: marketId, metadata: { status } } })
    return market
  }

  async listWallets(input: { page?: number; pageSize?: number; mode?: 'DEMO' | 'REAL' }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.WalletWhereInput = input.mode ? { account: { mode: input.mode } } : {}
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.wallet.count({ where }),
      this.prisma.wallet.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, currency: true, status: true, availableBalance: true, heldBalance: true, updatedAt: true, account: { select: { id: true, name: true, mode: true, user: { select: { id: true, email: true } } } } } }),
    ])
    return pageResult(rows.map((row) => ({ ...row, availableBalance: row.availableBalance.toString(), heldBalance: row.heldBalance.toString(), totalBalance: row.availableBalance.add(row.heldBalance).toString() })), total, p.page, p.pageSize)
  }

  async listDeposits(input: { page?: number; pageSize?: number; status?: string }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.DepositWhereInput = input.status ? { status: input.status as never } : {}
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.deposit.count({ where }),
      this.prisma.deposit.findMany({ where, orderBy: { requestedAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, provider: true, providerReference: true, amount: true, currency: true, status: true, failureReason: true, requestedAt: true, completedAt: true, wallet: { select: { id: true, account: { select: { mode: true, user: { select: { email: true } } } } } } } }),
    ])
    return pageResult(rows.map((row) => ({ ...row, amount: row.amount.toString() })), total, p.page, p.pageSize)
  }

  async listWithdrawals(input: { page?: number; pageSize?: number; status?: string }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.WithdrawalWhereInput = input.status ? { status: input.status as never } : {}
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({ where, orderBy: { requestedAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, provider: true, providerReference: true, destination: true, amount: true, currency: true, status: true, failureReason: true, requestedAt: true, completedAt: true, wallet: { select: { id: true, account: { select: { mode: true, user: { select: { email: true } } } } } } } }),
    ])
    return pageResult(rows.map((row) => ({ ...row, amount: row.amount.toString() })), total, p.page, p.pageSize)
  }

  async reconciliation() {
    const transactions = await this.prisma.ledgerTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, currency: true, referenceType: true, referenceId: true, description: true, createdAt: true, entries: { select: { direction: true, amount: true } } } })
    const checks = transactions.map((tx) => {
      const debit = tx.entries.filter((entry) => entry.direction === 'DEBIT').reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0))
      const credit = tx.entries.filter((entry) => entry.direction === 'CREDIT').reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0))
      return { id: tx.id, currency: tx.currency, referenceType: tx.referenceType, referenceId: tx.referenceId, description: tx.description, createdAt: tx.createdAt, balanced: debit.eq(credit), debit: debit.toString(), credit: credit.toString() }
    })
    const unbalanced = checks.filter((item) => !item.balanced)
    return { scanned: checks.length, balanced: checks.length - unbalanced.length, unbalanced: unbalanced.slice(0, 50) }
  }

  async listLedger(input: { page?: number; pageSize?: number }) {
    const p = paging(input.page, input.pageSize)
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ledgerTransaction.count(),
      this.prisma.ledgerTransaction.findMany({ orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, currency: true, referenceType: true, referenceId: true, description: true, createdAt: true, entries: { select: { direction: true, amount: true, ledgerAccount: { select: { code: true, name: true } } } } } }),
    ])
    return pageResult(rows.map((row) => ({ ...row, entries: row.entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })) })), total, p.page, p.pageSize)
  }

  async risk() {
    const [open, pendingOrders, rejectedOrders] = await Promise.all([
      this.prisma.position.findMany({ where: { status: 'OPEN' }, select: { amount: true, asset: { select: { symbol: true } } } }),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count({ where: { status: 'REJECTED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ])
    const totalExposure = open.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))
    return {
      limits: {
        maxOpenPositions: env.trading.maxOpenPositions,
        maxOpenExposure: env.trading.maxOpenExposure,
        marketMaxAgeMs: env.trading.marketMaxAgeMs,
        feeRate: env.trading.feeRate,
      },
      exposure: { openPositions: open.length, total: totalExposure.toString(), byAsset: Object.entries(open.reduce<Record<string, string>>((acc, item) => { acc[item.asset.symbol] = new Prisma.Decimal(acc[item.asset.symbol] ?? '0').add(item.amount).toString(); return acc }, {})).map(([symbol, amount]) => ({ symbol, amount })) },
      monitoring: { pendingOrders, rejectedOrders24h: rejectedOrders },
    }
  }

  async listAudit(input: { page?: number; pageSize?: number; action?: string; entityType?: string }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.AuditLogWhereInput = {
      ...(input.action ? { action: { contains: input.action } } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, action: true, entityType: true, entityId: true, metadata: true, ipAddress: true, userAgent: true, createdAt: true, actorUser: { select: { id: true, email: true } } } }),
    ])
    return pageResult(rows, total, p.page, p.pageSize)
  }

  async listSecurityEvents(input: { page?: number; pageSize?: number }) {
    const p = paging(input.page, input.pageSize)
    const where: Prisma.AuditLogWhereInput = { OR: [{ action: { startsWith: 'LOGIN_' } }, { action: { startsWith: 'TWO_FACTOR_' } }, { action: { contains: 'SECURITY' } }] }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.pageSize, select: { id: true, action: true, entityType: true, entityId: true, metadata: true, ipAddress: true, userAgent: true, createdAt: true, actorUser: { select: { id: true, email: true } } } }),
    ])
    return pageResult(rows, total, p.page, p.pageSize)
  }
}
