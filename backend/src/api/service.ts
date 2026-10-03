import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { getTradingRules } from '../trading/config.js'

export type WalletMode = 'DEMO' | 'REAL'

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

export type ApiWalletTransaction = {
  id: string
  type: string
  status: string
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
  constructor(private readonly prisma: PrismaClient) {}

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
    input: { page?: number; pageSize?: number },
    mode: WalletMode = 'DEMO',
  ): Promise<ApiListResult<ApiWalletTransaction>> {
    const paging = normalizePage(input.page, input.pageSize)
    const wallet = await this.getWallet(userId, mode)

    if (!wallet) return { items: [], pagination: paginate(0, paging.page, paging.pageSize) }

    const where = { walletId: wallet.id }
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
}
