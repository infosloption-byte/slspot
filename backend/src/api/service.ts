import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { getTradingRules } from '../trading/config.js'
import { LedgerService } from '../ledger/service.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { isRedisReady, publish } from '../realtime/redis.js'

export type WalletMode = 'DEMO' | 'REAL'

export class FinanceError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'FinanceError'
    this.statusCode = statusCode
    this.code = code
  }
}

export type ApiPage = {
  page: number
  pageSize: number
}

export type ApiListResult<T> = {
  items: T[]
  pagination: ApiPage & {
    total: number
    totalPages: number
  }
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

function normalizePage(page?: number, pageSize?: number): ApiPage {
  return {
    page: Math.max(DEFAULT_PAGE, Math.floor(page ?? DEFAULT_PAGE)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE))),
  }
}

function paginate(total: number, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export type ApiMarketAsset = {
  assetId: string
  symbol: string
  name: string
  type: string
  baseCurrency: string | null
  quoteCurrency: string | null
  priceScale: number
  quantityScale: number
  trading: {
    enabled: boolean
    payoutRate: string
    minAmount: string
    maxAmount: string
    durationsSeconds: number[]
    feeRate: string
  }
  market: {
    id: string
    status: string
    provider: string
    externalSymbol: string
    lastPrice: string | null
    lastPriceAt: string | null
  } | null
}

export type ApiPortfolioSummary = {
  currency: string | null
  availableBalance: string
  heldBalance: string
  totalBalance: string
  openPositionCount: number
  tradeCount: number
  netPnl: string
}

export type ApiPortfolioAnalytics = {
  currency: string
  dailyPnl: string
  weeklyPnl: string
  monthlyPnl: string
  wins: number
  losses: number
  winRate: string
  tradeCount: number
  volume: string
  averageTrade: string
  series: Array<{ date: string; pnl: string; cumulativePnl: string; tradeCount: number }>
  assets: Array<{ assetId: string; symbol: string; name: string; pnl: string; volume: string; trades: number; wins: number; losses: number }>
}

export type ApiFundingResult = {
  id: string
  type: 'DEPOSIT' | 'WITHDRAWAL'
  status: string
  amount: string
  currency: string
  walletId: string
  walletTransactionId: string | null
  provider: string
  providerReference: string | null
  destination?: string | null
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
}

export type ApiPosition = {
  id: string
  tradeId: string | null
  orderId: string
  status: string
  side: string
  direction: 'UP' | 'DOWN'
  amount: string
  entryPrice: string
  currentPrice: string | null
  exitPrice: string | null
  payoutRate: string
  fee: string
  durationSeconds: number
  expiresAt: string | null
  openedAt: string
  closedAt: string | null
  asset: {
    id: string
    symbol: string
    name: string
  }
}

export type ApiTrade = {
  id: string
  orderId: string
  status: string
  direction: 'UP' | 'DOWN'
  amount: string
  payoutRate: string
  durationSeconds: number
  expiresAt: string | null
  grossPnl: string | null
  fee: string
  netPnl: string | null
  settlementReference: string | null
  openedAt: string
  closedAt: string | null
  position: {
    id: string
    side: string
    amount: string
    entryPrice: string
    exitPrice: string | null
    asset: {
      id: string
      symbol: string
      name: string
    }
  }
}

export type ApiWallet = {
  id: string
  accountId: string
  mode: WalletMode
  name: string
  currency: string
  status: string
  availableBalance: string
  heldBalance: string
  totalBalance: string
}

export type WalletTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_HOLD' | 'TRADE_RELEASE' | 'SETTLEMENT' | 'FEE' | 'ADJUSTMENT'
export type WalletTransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED'

export type ApiWalletTransaction = {
  id: string
  type: WalletTransactionType
  status: WalletTransactionStatus
  amount: string
  currency: string
  referenceType: string | null
  referenceId: string | null
  description: string | null
  createdAt: string
}

export type ApiNotification = {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export class PlatformApiService {
  private readonly ledger: LedgerService

  constructor(private readonly prisma: PrismaClient) {
    this.ledger = new LedgerService(prisma)
  }

  async listAssets(input: { page?: number; pageSize?: number; type?: string }): Promise<ApiListResult<ApiMarketAsset>> {
    const paging = normalizePage(input.page, input.pageSize)
    const where = input.type
      ? { isActive: true, type: input.type as 'CRYPTO' | 'FOREX' | 'STOCK' | 'COMMODITY' | 'INDEX' | 'OTHER' }
      : { isActive: true }

    const [total, assets] = await this.prisma.$transaction([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { symbol: 'asc' }],
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        include: {
          markets: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ])

    return {
      items: assets.map((asset) => {
        const market = asset.markets[0]
        return {
          assetId: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          type: asset.type,
          baseCurrency: asset.baseCurrency,
          quoteCurrency: asset.quoteCurrency,
          priceScale: asset.priceScale,
          quantityScale: asset.quantityScale,
          trading: getTradingRules(asset.symbol, market?.status === 'OPEN'),
          market: market
            ? {
                id: market.id,
                status: market.status,
                provider: market.provider,
                externalSymbol: market.externalSymbol,
                lastPrice: market.lastPrice?.toString() ?? null,
                lastPriceAt: market.lastPriceAt?.toISOString() ?? null,
              }
            : null,
        }
      }),
      pagination: paginate(total, paging.page, paging.pageSize),
    }
  }

  async getPortfolioSummary(userId: string, mode: WalletMode = 'DEMO'): Promise<ApiPortfolioSummary> {
    const wallets = await this.getWallets(userId)
    const wallet = wallets.find((item) => item.mode === mode)

    const [openPositionCount, tradeCount, pnl] = await Promise.all([
      this.prisma.position.count({ where: { userId, status: 'OPEN', account: { mode } } }),
      this.prisma.trade.count({ where: { userId, position: { account: { mode } } } }),
      this.prisma.trade.aggregate({ where: { userId, position: { account: { mode } } }, _sum: { netPnl: true } }),
    ])

    return {
      currency: wallet?.currency ?? null,
      availableBalance: wallet?.availableBalance ?? '0',
      heldBalance: wallet?.heldBalance ?? '0',
      totalBalance: wallet?.totalBalance ?? '0.00000000',
      openPositionCount,
      tradeCount,
      netPnl: pnl._sum.netPnl?.toString() ?? '0',
    }
  }

  async listPositions(userId: string, input: { page?: number; pageSize?: number }, mode: WalletMode = 'DEMO'): Promise<ApiListResult<ApiPosition>> {
    const paging = normalizePage(input.page, input.pageSize)
    const where = { userId, account: { mode } }

    const [total, positions] = await this.prisma.$transaction([
      this.prisma.position.count({ where }),
      this.prisma.position.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        include: {
          asset: { include: { markets: { orderBy: { updatedAt: 'desc' }, take: 1 } } },
          order: true,
          trade: true,
        },
      }),
    ])

    return {
      items: positions.map((position) => {
        const market = position.asset.markets[0]
        return {
          id: position.id,
          tradeId: position.trade?.id ?? null,
          orderId: position.orderId,
          status: position.status,
          side: position.side,
          direction: position.side === 'BUY' ? 'UP' : 'DOWN',
          amount: position.amount.toString(),
          entryPrice: position.entryPrice.toString(),
          currentPrice: market?.lastPrice?.toString() ?? null,
          exitPrice: position.exitPrice?.toString() ?? null,
          payoutRate: position.order.payoutRate.toString(),
          fee: position.order.fee.toString(),
          durationSeconds: position.order.durationSeconds ?? 0,
          expiresAt: position.order.expiresAt?.toISOString() ?? null,
          openedAt: position.openedAt.toISOString(),
          closedAt: position.closedAt?.toISOString() ?? null,
          asset: {
            id: position.asset.id,
            symbol: position.asset.symbol,
            name: position.asset.name,
          },
        }
      }),
      pagination: paginate(total, paging.page, paging.pageSize),
    }
  }

  async listTrades(
    userId: string,
    input: {
      page?: number
      pageSize?: number
      statuses?: Array<'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'>
      search?: string
      assetId?: string
      direction?: 'UP' | 'DOWN'
      from?: Date
      to?: Date
      sortBy?: 'openedAt' | 'closedAt' | 'amount' | 'netPnl'
      sortOrder?: 'asc' | 'desc'
      settledOnly?: boolean
    },
    mode: WalletMode = 'DEMO',
  ): Promise<ApiListResult<ApiTrade>> {
    const paging = normalizePage(input.page, input.pageSize)
    const statusWhere = input.statuses?.length
      ? { in: input.statuses }
      : input.settledOnly
        ? { not: 'OPEN' as const }
        : undefined
    const positionWhere = {
      account: { mode },
      ...(input.assetId ? { assetId: input.assetId } : {}),
      ...(input.direction ? { side: input.direction === 'UP' ? 'BUY' as const : 'SELL' as const } : {}),
    }
    const where: Prisma.TradeWhereInput = {
      userId,
      ...(statusWhere ? { status: statusWhere } : {}),
      ...(input.from || input.to
        ? {
            openedAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
      position: positionWhere,
      ...(input.search
        ? {
            OR: [
              { id: { contains: input.search } },
              { position: { id: { contains: input.search } } },
              { position: { asset: { symbol: { contains: input.search } } } },
              { position: { asset: { name: { contains: input.search } } } },
            ],
          }
        : {}),
    }

    const sortOrder = input.sortOrder ?? 'desc'
    const orderBy: Prisma.TradeOrderByWithRelationInput =
      input.sortBy === 'closedAt'
        ? { closedAt: sortOrder }
        : input.sortBy === 'amount'
          ? { position: { amount: sortOrder } }
          : input.sortBy === 'netPnl'
            ? { netPnl: sortOrder }
            : { openedAt: sortOrder }

    const [total, trades] = await this.prisma.$transaction([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        orderBy,
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        include: {
          position: { include: { asset: true, order: true } },
          settlement: true,
        },
      }),
    ])

    return {
      items: trades.map((trade) => ({
        id: trade.id,
        orderId: trade.position.orderId,
        status: trade.status,
        direction: trade.position.side === 'BUY' ? 'UP' : 'DOWN',
        amount: trade.position.amount.toString(),
        payoutRate: trade.position.order.payoutRate.toString(),
        durationSeconds: trade.position.order.durationSeconds ?? 0,
        expiresAt: trade.position.order.expiresAt?.toISOString() ?? null,
        grossPnl: trade.grossPnl?.toString() ?? null,
        fee: trade.fee.toString(),
        netPnl: trade.netPnl?.toString() ?? null,
        settlementReference: trade.settlement?.referenceId ?? null,
        openedAt: trade.openedAt.toISOString(),
        closedAt: trade.closedAt?.toISOString() ?? null,
        position: {
          id: trade.position.id,
          side: trade.position.side,
          amount: trade.position.amount.toString(),
          entryPrice: trade.position.entryPrice.toString(),
          exitPrice: trade.position.exitPrice?.toString() ?? null,
          asset: {
            id: trade.position.asset.id,
            symbol: trade.position.asset.symbol,
            name: trade.position.asset.name,
          },
        },
      })),
      pagination: paginate(total, paging.page, paging.pageSize),
    }
  }

  async getWallets(userId: string): Promise<ApiWallet[]> {
    return this.prisma.$transaction(async (tx) => {
      const wallets: ApiWallet[] = []
      for (const mode of ['DEMO', 'REAL'] as const) {
        const record = await this.ensureWallet(tx, userId, 'USD', mode)
        if (record) wallets.push(this.toApiWallet(record))
      }
      return wallets
    })
  }

  async getWallet(userId: string, mode: WalletMode = 'DEMO'): Promise<ApiWallet | null> {
    const wallets = await this.getWallets(userId)
    return wallets.find((wallet) => wallet.mode === mode) ?? null
  }

  async listWalletTransactions(
    userId: string,
    input: {
      page?: number
      pageSize?: number
      types?: WalletTransactionType[]
      statuses?: WalletTransactionStatus[]
      search?: string
      from?: Date
      to?: Date
    },
    mode: WalletMode = 'DEMO',
  ): Promise<ApiListResult<ApiWalletTransaction>> {
    const paging = normalizePage(input.page, input.pageSize)
    const wallet = await this.getWallet(userId, mode)

    if (!wallet) return { items: [], pagination: paginate(0, paging.page, paging.pageSize) }

    const where: Prisma.WalletTransactionWhereInput = {
      walletId: wallet.id,
      ...(input.types?.length ? { type: { in: input.types } } : {}),
      ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
      ...(input.search?.trim()
        ? {
            OR: [
              { id: { contains: input.search.trim() } },
              { referenceType: { contains: input.search.trim() } },
              { referenceId: { contains: input.search.trim() } },
              { description: { contains: input.search.trim() } },
            ],
          }
        : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    }

    const [total, transactions] = await this.prisma.$transaction([
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
    ])

    return {
      items: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        description: transaction.description,
        createdAt: transaction.createdAt.toISOString(),
      })),
      pagination: paginate(total, paging.page, paging.pageSize),
    }
  }

  async getPortfolioAnalytics(userId: string, mode: WalletMode = 'DEMO'): Promise<ApiPortfolioAnalytics> {
    const wallet = await this.getWallet(userId, mode)
    const currency = wallet?.currency ?? 'USD'
    const now = new Date()
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const weekStart = new Date(dayStart)
    const weekday = weekStart.getUTCDay()
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekday + 6) % 7))
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const seriesStart = new Date(dayStart)
    seriesStart.setUTCDate(seriesStart.getUTCDate() - 29)

    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        status: { in: ['WON', 'LOST', 'CANCELLED', 'EXPIRED'] },
        openedAt: { gte: seriesStart },
        position: { account: { mode } },
      },
      include: { position: { include: { asset: true } } },
      orderBy: { openedAt: 'asc' },
      take: 10000,
    })

    const pnlFor = (trade: typeof trades[number]) => trade.netPnl ?? new Prisma.Decimal(0)
    const amountFor = (trade: typeof trades[number]) => trade.position.amount
    const tradeTimestamp = (trade: typeof trades[number]) => trade.closedAt ?? trade.openedAt

    const sumPnl = (from: Date) => trades
      .filter((trade) => tradeTimestamp(trade) >= from)
      .reduce((sum, trade) => sum.plus(pnlFor(trade)), new Prisma.Decimal(0))

    const winTrades = trades.filter((trade) => trade.status === 'WON')
    const lossTrades = trades.filter((trade) => trade.status === 'LOST')
    const resolvedCount = winTrades.length + lossTrades.length
    const volume = trades.reduce((sum, trade) => sum.plus(amountFor(trade)), new Prisma.Decimal(0))
    const averageTrade = trades.length ? volume.div(trades.length) : new Prisma.Decimal(0)

    let cumulativePnl = new Prisma.Decimal(0)
    const series: ApiPortfolioAnalytics['series'] = []
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date(seriesStart)
      date.setUTCDate(seriesStart.getUTCDate() + offset)
      const next = new Date(date)
      next.setUTCDate(date.getUTCDate() + 1)
      const dayTrades = trades.filter((trade) => {
        const timestamp = tradeTimestamp(trade)
        return timestamp >= date && timestamp < next
      })
      const dayPnl = dayTrades.reduce((sum, trade) => sum.plus(pnlFor(trade)), new Prisma.Decimal(0))
      cumulativePnl = cumulativePnl.plus(dayPnl)
      series.push({
        date: date.toISOString().slice(0, 10),
        pnl: dayPnl.toString(),
        cumulativePnl: cumulativePnl.toString(),
        tradeCount: dayTrades.length,
      })
    }

    const assetMap = new Map<string, ApiPortfolioAnalytics['assets'][number]>()
    for (const trade of trades) {
      const asset = trade.position.asset
      const existing = assetMap.get(asset.id) ?? {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        pnl: '0',
        volume: '0',
        trades: 0,
        wins: 0,
        losses: 0,
      }
      existing.pnl = new Prisma.Decimal(existing.pnl).plus(pnlFor(trade)).toString()
      existing.volume = new Prisma.Decimal(existing.volume).plus(amountFor(trade)).toString()
      existing.trades += 1
      if (trade.status === 'WON') existing.wins += 1
      if (trade.status === 'LOST') existing.losses += 1
      assetMap.set(asset.id, existing)
    }

    return {
      currency,
      dailyPnl: sumPnl(dayStart).toString(),
      weeklyPnl: sumPnl(weekStart).toString(),
      monthlyPnl: sumPnl(monthStart).toString(),
      wins: winTrades.length,
      losses: lossTrades.length,
      winRate: resolvedCount ? new Prisma.Decimal(winTrades.length).div(resolvedCount).mul(100).toFixed(2) : '0',
      tradeCount: trades.length,
      volume: volume.toString(),
      averageTrade: averageTrade.toString(),
      series,
      assets: [...assetMap.values()].sort((a, b) => Number(b.pnl) - Number(a.pnl)),
    }
  }

  async createDemoDeposit(
    userId: string,
    input: { amount: string; clientRequestId: string },
  ): Promise<ApiFundingResult> {
    const requestId = input.clientRequestId.trim()
    if (!requestId) throw new FinanceError(400, 'INVALID_IDEMPOTENCY_KEY', 'A client request ID is required')
    const amount = this.parseFundingAmount(input.amount)

    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey: 'deposit:' + requestId },
      include: { deposit: true },
    })
    if (existing?.deposit) return this.toApiDeposit(existing.deposit)

    const result = await this.prisma.$transaction(async (tx) => {
      const walletRecord = await this.ensureWallet(tx, userId, 'USD', 'DEMO')
      const systemCode = await this.ledger.ensureSystemLedgerAccount(tx, 'SYSTEM:DEMO_FUNDING', 'Demo funding source', 'EQUITY', walletRecord.wallet.currency)
      const walletCode = await this.ledger.ensureWalletLedgerAccounts(tx, walletRecord.account.id, walletRecord.wallet.currency)

      const deposit = await tx.deposit.create({
        data: {
          walletId: walletRecord.wallet.id,
          provider: 'DEMO',
          amount,
          currency: walletRecord.wallet.currency,
          status: 'PROCESSING',
          requestedAt: new Date(),
        },
      })

      const walletUpdated = await tx.wallet.updateMany({
        where: { id: walletRecord.wallet.id, status: 'ACTIVE' },
        data: { availableBalance: { increment: amount } },
      })
      if (walletUpdated.count !== 1) throw new FinanceError(409, 'WALLET_UPDATE_FAILED', 'Demo wallet could not be credited')

      const wallet = await tx.wallet.findUnique({ where: { id: walletRecord.wallet.id } })
      if (!wallet) throw new FinanceError(409, 'WALLET_NOT_FOUND', 'Demo wallet disappeared while processing deposit')

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount,
          currency: wallet.currency,
          idempotencyKey: 'deposit:' + requestId,
          referenceType: 'DEPOSIT',
          referenceId: deposit.id,
          description: 'Demo deposit',
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })

      await this.ledger.postTransaction(tx, {
        walletTransactionId: walletTransaction.id,
        currency: wallet.currency,
        referenceType: 'DEPOSIT',
        referenceId: deposit.id,
        description: 'Demo deposit',
        lines: [
          { accountCode: systemCode, accountName: 'Demo funding source', accountType: 'EQUITY', direction: 'DEBIT', amount },
          { accountCode: walletCode.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'CREDIT', amount },
        ],
      })

      return tx.deposit.update({
        where: { id: deposit.id },
        data: {
          walletTransactionId: walletTransaction.id,
          providerReference: 'demo-deposit:' + deposit.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
    })

    await this.createNotification(userId, 'DEPOSIT', 'Demo deposit completed', 'Demo wallet was credited with ' + amount.toString() + ' ' + result.currency + '.')
    return this.toApiDeposit(result)
  }

  async createDemoWithdrawal(
    userId: string,
    input: { amount: string; destination: string; clientRequestId: string },
  ): Promise<ApiFundingResult> {
    const requestId = input.clientRequestId.trim()
    if (!requestId) throw new FinanceError(400, 'INVALID_IDEMPOTENCY_KEY', 'A client request ID is required')
    const amount = this.parseFundingAmount(input.amount)
    const destination = input.destination.trim()
    if (!destination) throw new FinanceError(400, 'INVALID_DESTINATION', 'A withdrawal destination is required')

    const result = await this.prisma.$transaction(async (tx) => {
      const walletRecord = await this.ensureWallet(tx, userId, 'USD', 'DEMO')
      const systemCode = await this.ledger.ensureSystemLedgerAccount(tx, 'SYSTEM:DEMO_WITHDRAWAL', 'Demo withdrawal clearing', 'ASSET', walletRecord.wallet.currency)
      const walletCode = await this.ledger.ensureWalletLedgerAccounts(tx, walletRecord.account.id, walletRecord.wallet.currency)

      const existingTx = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: 'withdrawal:' + requestId },
        include: { withdrawal: true },
      })
      if (existingTx?.withdrawal) return existingTx.withdrawal

      const claimed = await tx.wallet.updateMany({
        where: {
          id: walletRecord.wallet.id,
          status: 'ACTIVE',
          availableBalance: { gte: amount },
        },
        data: { availableBalance: { decrement: amount } },
      })
      if (claimed.count !== 1) throw new FinanceError(422, 'INSUFFICIENT_FUNDS', 'Insufficient available demo balance')

      const wallet = await tx.wallet.findUnique({ where: { id: walletRecord.wallet.id } })
      if (!wallet) throw new FinanceError(409, 'WALLET_NOT_FOUND', 'Demo wallet disappeared while processing withdrawal')

      const withdrawal = await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          provider: 'DEMO',
          amount,
          currency: wallet.currency,
          destination,
          status: 'PROCESSING',
          requestedAt: new Date(),
        },
      })

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          amount: amount.neg(),
          currency: wallet.currency,
          idempotencyKey: 'withdrawal:' + requestId,
          referenceType: 'WITHDRAWAL',
          referenceId: withdrawal.id,
          description: 'Demo withdrawal',
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })

      await this.ledger.postTransaction(tx, {
        walletTransactionId: walletTransaction.id,
        currency: wallet.currency,
        referenceType: 'WITHDRAWAL',
        referenceId: withdrawal.id,
        description: 'Demo withdrawal',
        lines: [
          { accountCode: walletCode.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'DEBIT', amount },
          { accountCode: systemCode, accountName: 'Demo withdrawal clearing', accountType: 'ASSET', direction: 'CREDIT', amount },
        ],
      })

      return tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          walletTransactionId: walletTransaction.id,
          providerReference: 'demo-withdrawal:' + withdrawal.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
    })

    await this.createNotification(userId, 'WITHDRAWAL', 'Demo withdrawal completed', 'Demo wallet withdrawal of ' + result.amount.toString() + ' ' + result.currency + ' was completed.')
    return this.toApiWithdrawal(result)
  }

  async reconcileWallet(userId: string, mode: WalletMode = 'DEMO') {
    const wallet = await this.getWallet(userId, mode)
    if (!wallet) throw new FinanceError(404, 'WALLET_NOT_FOUND', 'Wallet not found')
    return this.ledger.reconcileWallet(userId, wallet.accountId)
  }

  private async ensureWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: string,
    mode: WalletMode,
  ) {
    const normalizedCurrency = currency.slice(0, 3).toUpperCase()
    let account = await tx.account.findUnique({
      where: { userId_currency_mode: { userId, currency: normalizedCurrency, mode } },
    })

    if (!account) {
      account = await tx.account.create({
        data: {
          userId,
          name: mode === 'DEMO' ? 'Demo Trading Account' : 'Real Trading Account',
          currency: normalizedCurrency,
          mode,
          status: 'ACTIVE',
        },
      })
    }

    if (account.status !== 'ACTIVE') return null

    let wallet = await tx.wallet.findUnique({ where: { accountId: account.id } })
    if (!wallet) {
      const initialBalance = mode === 'DEMO'
        ? new Prisma.Decimal(env.trading.initialBalance)
        : new Prisma.Decimal(0)
      wallet = await tx.wallet.create({
        data: {
          accountId: account.id,
          currency: account.currency,
          status: 'ACTIVE',
          availableBalance: initialBalance,
          heldBalance: 0,
        },
      })

      if (mode === 'DEMO' && initialBalance.gt(0)) {
        await this.recordDemoFunding(tx, wallet.id, account.id, account.currency, initialBalance, 'Initial demo trading balance')
      }
    }

    if (mode === 'DEMO' && wallet.status === 'ACTIVE' && wallet.availableBalance.lte(0) && wallet.heldBalance.lte(0)) {
      const refillAmount = new Prisma.Decimal(env.trading.initialBalance)
      if (refillAmount.gt(0)) {
        const claimed = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            status: 'ACTIVE',
            availableBalance: { lte: 0 },
            heldBalance: { lte: 0 },
          },
          data: { availableBalance: { increment: refillAmount } },
        })

        if (claimed.count === 1) {
          await this.recordDemoFunding(tx, wallet.id, account.id, account.currency, refillAmount, 'Demo wallet auto-refill')
        }

        wallet = await tx.wallet.findUnique({ where: { id: wallet.id } }) ?? wallet
      }
    }

    return { account, wallet }
  }

  private async recordDemoFunding(
    tx: Prisma.TransactionClient,
    walletId: string,
    accountId: string,
    currency: string,
    amount: Prisma.Decimal,
    description: string,
  ): Promise<void> {
    const walletTransaction = await tx.walletTransaction.create({
      data: {
        walletId,
        type: 'ADJUSTMENT',
        status: 'COMPLETED',
        amount,
        currency,
        idempotencyKey: 'demo-funding:' + walletId + ':' + randomUUID(),
        referenceType: 'DEMO_WALLET',
        referenceId: walletId,
        description,
      },
    })

    await tx.ledgerEntry.create({
      data: {
        transactionId: walletTransaction.id,
        accountId,
        walletTransactionId: walletTransaction.id,
        direction: 'CREDIT',
        amount,
        currency,
        referenceType: 'DEMO_WALLET',
        referenceId: walletId,
      },
    })
  }

  private toApiWallet(record: {
    account: { id: string; mode: string; name: string }
    wallet: {
      id: string
      accountId: string
      currency: string
      status: string
      availableBalance: Prisma.Decimal
      heldBalance: Prisma.Decimal
    }
  }): ApiWallet {
    return {
      id: record.wallet.id,
      accountId: record.wallet.accountId,
      mode: record.account.mode as WalletMode,
      name: record.account.name,
      currency: record.wallet.currency,
      status: record.wallet.status,
      availableBalance: record.wallet.availableBalance.toString(),
      heldBalance: record.wallet.heldBalance.toString(),
      totalBalance: record.wallet.availableBalance.add(record.wallet.heldBalance).toFixed(8),
    }
  }

  async listNotifications(userId: string, input: { page?: number; pageSize?: number; unreadOnly?: boolean }): Promise<ApiListResult<ApiNotification>> {
    const paging = normalizePage(input.page, input.pageSize)
    const where = {
      userId,
      ...(input.unreadOnly ? { readAt: null } : {}),
    }

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
    ])

    return {
      items: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
      pagination: paginate(total, paging.page, paging.pageSize),
    }
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { readAt: true },
    })

    if (!notification) return false
    if (notification.readAt) return true

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    })
    return true
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return result.count
  }

  async createNotification(
    userId: string,
    type: 'TRADE_RESULT' | 'DEPOSIT' | 'WITHDRAWAL' | 'SECURITY' | 'VERIFICATION' | 'SYSTEM',
    title: string,
    body: string,
  ): Promise<ApiNotification> {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body },
    })
    const channel = ('user:' + userId) as `user:${string}`
    if (isRedisReady()) {
      try {
        await publish(
          env.redisChannel,
          serializeRealtimeEvent(
            createRealtimeEvent(
              'notification.created',
              {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                body: notification.body,
                readAt: null,
                createdAt: notification.createdAt.toISOString(),
              },
              channel,
            ),
          ),
        )
      } catch {
        // Durable notification storage remains the source of truth.
      }
    }
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    }
  }

  private parseFundingAmount(value: string): Prisma.Decimal {
    try {
      const amount = new Prisma.Decimal(value)
      if (!amount.isFinite() || amount.lte(0) || amount.gt(new Prisma.Decimal('1000000'))) {
        throw new Error('invalid')
      }
      return amount
    } catch {
      throw new FinanceError(400, 'INVALID_FUNDING_AMOUNT', 'Funding amount must be a positive decimal not greater than 1000000')
    }
  }

  private toApiDeposit(deposit: {
    id: string
    walletId: string
    walletTransactionId: string | null
    provider: string
    providerReference: string | null
    amount: Prisma.Decimal
    currency: string
    status: string
    failureReason: string | null
    requestedAt: Date
    completedAt: Date | null
  }): ApiFundingResult {
    return {
      id: deposit.id,
      type: 'DEPOSIT',
      status: deposit.status,
      amount: deposit.amount.toString(),
      currency: deposit.currency,
      walletId: deposit.walletId,
      walletTransactionId: deposit.walletTransactionId,
      provider: deposit.provider,
      providerReference: deposit.providerReference,
      failureReason: deposit.failureReason,
      requestedAt: deposit.requestedAt.toISOString(),
      completedAt: deposit.completedAt?.toISOString() ?? null,
    }
  }

  private toApiWithdrawal(withdrawal: {
    id: string
    walletId: string
    walletTransactionId: string | null
    provider: string
    providerReference: string | null
    amount: Prisma.Decimal
    currency: string
    status: string
    failureReason: string | null
    requestedAt: Date
    completedAt: Date | null
    destination: string | null
  }): ApiFundingResult {
    return {
      id: withdrawal.id,
      type: 'WITHDRAWAL',
      status: withdrawal.status,
      amount: withdrawal.amount.toString(),
      currency: withdrawal.currency,
      walletId: withdrawal.walletId,
      walletTransactionId: withdrawal.walletTransactionId,
      provider: withdrawal.provider,
      providerReference: withdrawal.providerReference,
      destination: withdrawal.destination,
      failureReason: withdrawal.failureReason,
      requestedAt: withdrawal.requestedAt.toISOString(),
      completedAt: withdrawal.completedAt?.toISOString() ?? null,
    }
  }

}
