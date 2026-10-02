import type { PrismaClient } from '../generated/prisma/client.js'
import { getTradingRules } from '../trading/config.js'

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

  async getPortfolioSummary(userId: string): Promise<ApiPortfolioSummary> {
    const account = await this.prisma.account.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: {
        wallets: {
          where: { status: { not: 'CLOSED' } },
          take: 1,
        },
      },
    })

    const wallet = account?.wallets[0]

    const [openPositionCount, tradeCount, pnl] = await Promise.all([
      this.prisma.position.count({ where: { userId, status: 'OPEN' } }),
      this.prisma.trade.count({ where: { userId } }),
      this.prisma.trade.aggregate({ where: { userId }, _sum: { netPnl: true } }),
    ])

    const availableBalance = wallet?.availableBalance?.toString() ?? '0'
    const heldBalance = wallet?.heldBalance?.toString() ?? '0'
    const totalBalance = wallet
      ? wallet.availableBalance.add(wallet.heldBalance).toFixed(8)
      : '0.00000000'

    return {
      currency: account?.currency ?? null,
      availableBalance,
      heldBalance,
      totalBalance,
      openPositionCount,
      tradeCount,
      netPnl: pnl._sum.netPnl?.toString() ?? '0',
    }
  }

  async listPositions(userId: string, input: { page?: number; pageSize?: number }): Promise<ApiListResult<ApiPosition>> {
    const paging = normalizePage(input.page, input.pageSize)
    const where = { userId }

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

  async listTrades(userId: string, input: { page?: number; pageSize?: number; status?: string }): Promise<ApiListResult<ApiTrade>> {
    const paging = normalizePage(input.page, input.pageSize)
    const where = {
      userId,
      ...(input.status ? { status: input.status as 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED' } : {}),
    }

    const [total, trades] = await this.prisma.$transaction([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        orderBy: { openedAt: 'desc' },
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

  async getWallet(userId: string): Promise<ApiWallet | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { account: { userId }, status: { not: 'CLOSED' } },
    })

    if (!wallet) return null

    return {
      id: wallet.id,
      accountId: wallet.accountId,
      currency: wallet.currency,
      status: wallet.status,
      availableBalance: wallet.availableBalance.toString(),
      heldBalance: wallet.heldBalance.toString(),
      totalBalance: wallet.availableBalance.add(wallet.heldBalance).toFixed(8),
    }
  }

  async listWalletTransactions(userId: string, input: { page?: number; pageSize?: number }): Promise<ApiListResult<ApiWalletTransaction>> {
    const paging = normalizePage(input.page, input.pageSize)
    const wallet = await this.prisma.wallet.findFirst({
      where: { account: { userId }, status: { not: 'CLOSED' } },
      select: { id: true },
    })

    if (!wallet) {
      return { items: [], pagination: paginate(0, paging.page, paging.pageSize) }
    }

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
