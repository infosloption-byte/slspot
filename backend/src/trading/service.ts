import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { isRedisReady, publish } from '../realtime/redis.js'
import { getTradingRules, TRADING_RULES } from './config.js'

export type TradeDirection = 'UP' | 'DOWN'
export type WalletMode = 'DEMO' | 'REAL'

export type CreateTradeInput = {
  clientRequestId: string
  assetId: string
  direction: TradeDirection
  amount: string
  durationSeconds: number
}

export type ApiTradingPosition = {
  id: string
  tradeId: string
  orderId: string
  status: 'OPEN' | 'CLOSED'
  direction: TradeDirection
  amount: string
  entryPrice: string
  currentPrice: string | null
  exitPrice: string | null
  payoutRate: string
  fee: string
  openedAt: string
  closedAt: string | null
  durationSeconds: number
  expiresAt: string
  asset: { id: string; symbol: string; name: string }
}

export type ApiTradingResult = {
  orderId: string
  tradeId: string
  positionId: string
  status: string
  direction: TradeDirection
  amount: string
  entryPrice: string
  exitPrice: string | null
  payoutRate: string
  fee: string
  grossPnl: string | null
  netPnl: string | null
  openedAt: string
  closedAt: string | null
  expiresAt: string | null
  settlementId: string | null
  settlementPrice: string | null
  settlementReference: string | null
}

export class TradingError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'TradingError'
    this.statusCode = statusCode
    this.code = code
  }
}

export function assertManualSettlementAllowed(expiresAt: Date, now = new Date()): void {
  if (expiresAt.getTime() > now.getTime()) {
    throw new TradingError(409, 'TRADE_NOT_EXPIRED', 'Trade can only be settled after expiry')
  }
}

export function evaluateTrade(direction: TradeDirection, entryPrice: string, exitPrice: string): boolean {
  const entry = new Prisma.Decimal(entryPrice)
  const exit = new Prisma.Decimal(exitPrice)
  return direction === 'UP' ? exit.gte(entry) : exit.lte(entry)
}

export function calculateSettlementTerms(input: {
  amount: string
  payoutRate: string
  fee: string
  won: boolean
}) {
  const amount = new Prisma.Decimal(input.amount)
  const payoutRate = new Prisma.Decimal(input.payoutRate)
  const fee = new Prisma.Decimal(input.fee)
  const profit = input.won ? amount.mul(payoutRate) : new Prisma.Decimal(0)
  const grossPnl = input.won ? profit : amount.neg()
  const grossPayout = input.won ? amount.plus(profit) : new Prisma.Decimal(0)
  const netPnl = grossPnl.minus(fee)

  return {
    profit,
    grossPnl,
    grossPayout,
    netPnl,
    fee,
    holdAmount: amount,
  }
}

type TradingTradeRecord = {
  id: string
  userId: string
  status: string
  grossPnl: Prisma.Decimal | null
  fee: Prisma.Decimal
  netPnl: Prisma.Decimal | null
  openedAt: Date
  closedAt: Date | null
}

type TradingPositionRecord = {
  id: string
  userId: string
  accountId: string
  assetId: string
  side: 'BUY' | 'SELL'
  amount: Prisma.Decimal
  entryPrice: Prisma.Decimal
  exitPrice: Prisma.Decimal | null
  openedAt: Date
  closedAt: Date | null
  order: {
    id: string
    amount: Prisma.Decimal
    durationSeconds: number | null
    expiresAt: Date | null
    payoutRate: Prisma.Decimal
    fee: Prisma.Decimal
    clientRequestId: string
    status: string
  }
  asset: { id: string; symbol: string; name: string }
}

type TradingSettlementRecord = {
  id: string
  status: string
  settlementPrice: Prisma.Decimal | null
  referenceId: string | null
  netPnl: Prisma.Decimal | null
  settledAt: Date | null
}

type TradeDetails = {
  trade: TradingTradeRecord
  position: TradingPositionRecord
  settlement: TradingSettlementRecord | null
}

export class TradingService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: {
      info: (value: unknown, message?: string) => void
      warn: (value: unknown, message?: string) => void
      error: (value: unknown, message?: string) => void
    } = console,
  ) {}

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await this.settleExpiredTrades()
    this.schedule()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async createTrade(userId: string, input: CreateTradeInput, mode: WalletMode = 'DEMO'): Promise<ApiTradingResult> {
    const requestId = input.clientRequestId.trim()
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) {
      throw new TradingError(400, 'INVALID_IDEMPOTENCY_KEY', 'clientRequestId must be 1-128 safe characters')
    }
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1) {
      throw new TradingError(400, 'INVALID_DURATION', 'Duration must be a positive integer')
    }

    const existing = await this.prisma.order.findUnique({
      where: { clientRequestId: requestId },
      include: {
        position: {
          include: {
            asset: true,
            order: true,
            trade: { include: { settlement: true } },
          },
        },
      },
    })

    if (existing && existing.userId !== userId) {
      throw new TradingError(409, 'IDEMPOTENCY_CONFLICT', 'The idempotency key is already associated with another user')
    }
    if (existing?.position?.trade) {
      return this.toTradingResult(existing.position.trade, existing.position, existing.position.trade.settlement)
    }
    if (existing) {
      throw new TradingError(409, 'ORDER_ALREADY_EXISTS', 'The order already exists')
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } })
        if (!user || user.status !== 'ACTIVE') {
          throw new TradingError(403, 'USER_NOT_ELIGIBLE', 'The account is not eligible for trading')
        }

        const asset = await tx.asset.findUnique({
          where: { id: input.assetId },
          include: { markets: { orderBy: { updatedAt: 'desc' }, take: 1 } },
        })
        if (!asset || !asset.isActive) {
          throw new TradingError(404, 'ASSET_UNAVAILABLE', 'The selected asset is unavailable')
        }

        const market = asset.markets[0]
        const now = new Date()
        const rules = getTradingRules(asset.symbol, Boolean(market && market.status === 'OPEN'))
        const account = await this.ensureAccount(tx, userId, asset.quoteCurrency ?? 'USD', mode)
        let wallet = await this.ensureWallet(tx, account.id, account.currency, mode === 'DEMO')
        if (mode === 'DEMO') wallet = await this.ensureDemoBalance(tx, account.id, wallet)
        if (wallet.status !== 'ACTIVE') {
          throw new TradingError(403, 'WALLET_NOT_ELIGIBLE', 'The trading wallet is not active')
        }

        const amount = this.parseAmount(input.amount)
        const payoutRate = new Prisma.Decimal(rules.payoutRate)
        const fee = amount.mul(new Prisma.Decimal(rules.feeRate))
        const holdAmount = amount

        const openPositionTotals = await tx.position.aggregate({
          where: { userId, status: 'OPEN', account: { mode } },
          _count: { _all: true },
          _sum: { amount: true },
        })

        const rejection = this.validateTrade({
          amount,
          durationSeconds: input.durationSeconds,
          market,
          rules,
          walletBalance: wallet?.availableBalance ?? new Prisma.Decimal(0),
          now,
          openPositionCount: openPositionTotals._count._all,
          openExposure: openPositionTotals._sum.amount ?? new Prisma.Decimal(0),
        })

        const order = await tx.order.create({
          data: {
            clientRequestId: requestId,
            userId,
            accountId: account.id,
            assetId: asset.id,
            type: 'MARKET',
            side: input.direction === 'UP' ? 'BUY' : 'SELL',
            status: rejection ? 'REJECTED' : 'PENDING',
            amount,
            requestedPrice: market?.lastPrice ?? null,
            payoutRate,
            fee,
            durationSeconds: input.durationSeconds,
            expiresAt: rejection ? null : new Date(now.getTime() + input.durationSeconds * 1000),
            rejectionReason: rejection,
          },
        })

        if (rejection) {
          return { kind: 'rejected' as const, order, asset }
        }

        const held = await tx.wallet.updateMany({
          where: {
            id: wallet!.id,
            status: 'ACTIVE',
            availableBalance: { gte: holdAmount.plus(fee) },
          },
          data: {
            availableBalance: { decrement: holdAmount.plus(fee) },
            heldBalance: { increment: holdAmount },
          },
        })

        if (held.count !== 1) {
          const rejected = await tx.order.update({
            where: { id: order.id },
            data: { status: 'REJECTED', rejectionReason: 'Insufficient available balance' },
          })
          return { kind: 'rejected' as const, order: rejected, asset }
        }

        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'ACCEPTED',
            executedPrice: market!.lastPrice!,
            acceptedAt: now,
          },
        })

        const position = await tx.position.create({
          data: {
            orderId: updatedOrder.id,
            userId,
            accountId: account.id,
            assetId: asset.id,
            side: updatedOrder.side,
            amount,
            entryPrice: market!.lastPrice!,
          },
        })

        const trade = await tx.trade.create({
          data: {
            positionId: position.id,
            userId,
            status: 'OPEN',
            fee,
          },
        })

        const holdTx = await tx.walletTransaction.create({
          data: {
            walletId: wallet!.id,
            type: 'TRADE_HOLD',
            status: 'COMPLETED',
            amount: holdAmount.neg(),
            currency: wallet!.currency,
            idempotencyKey: 'trade-hold:' + trade.id,
            referenceType: 'TRADE',
            referenceId: trade.id,
            description: 'Funds held for trade ' + trade.id,
          },
        })

        await tx.ledgerEntry.create({
          data: {
            transactionId: holdTx.id,
            accountId: account.id,
            walletTransactionId: holdTx.id,
            direction: 'DEBIT',
            amount: holdAmount,
            currency: wallet!.currency,
            referenceType: 'TRADE_HOLD',
            referenceId: trade.id,
          },
        })

        if (fee.gt(0)) {
          const feeTx = await tx.walletTransaction.create({
            data: {
              walletId: wallet!.id,
              type: 'FEE',
              status: 'COMPLETED',
              amount: fee.neg(),
              currency: wallet!.currency,
              idempotencyKey: 'trade-fee:' + trade.id,
              referenceType: 'TRADE',
              referenceId: trade.id,
              description: 'Trading fee for ' + trade.id,
            },
          })

          await tx.ledgerEntry.create({
            data: {
              transactionId: feeTx.id,
              accountId: account.id,
              walletTransactionId: feeTx.id,
              direction: 'DEBIT',
              amount: fee,
              currency: wallet!.currency,
              referenceType: 'FEE',
              referenceId: trade.id,
            },
          })
        }

        return { kind: 'opened' as const, order: updatedOrder, position, trade, asset }
      })

      if (result.kind === 'rejected') {
        throw new TradingError(422, 'ORDER_REJECTED', result.order.rejectionReason ?? 'Trade request was rejected')
      }

      const tradingResult = this.toTradingResult(
        result.trade,
        { ...result.position, order: result.order, asset: result.asset },
        null,
      )
      await this.publishTradeOpened(userId, tradingResult)
      return tradingResult
    } catch (error) {
      if (error instanceof TradingError) throw error

      if (error instanceof Error && /Unique constraint|unique constraint/i.test(error.message)) {
        const retry = await this.prisma.order.findUnique({
          where: { clientRequestId: requestId },
          include: {
            position: {
              include: {
                asset: true,
                order: true,
                trade: { include: { settlement: true } },
              },
            },
          },
        })
        if (retry?.position?.trade) {
          return this.toTradingResult(retry.position.trade, retry.position, retry.position.trade.settlement)
        }
      }

      throw error
    }
  }

  async closeTrade(userId: string, tradeId: string, mode: WalletMode = 'DEMO'): Promise<ApiTradingResult> {
    const details = await this.loadTrade(tradeId)
    if (!details || details.trade.userId !== userId) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }
    const tradeAccount = await this.prisma.account.findUnique({ where: { id: details.position.accountId }, select: { mode: true } })
    if (!tradeAccount || tradeAccount.mode !== mode) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }
    if (details.trade.status !== 'OPEN' || !details.position.order.expiresAt) {
      if (details.settlement) return this.toTradingResult(details.trade, details.position, details.settlement)
      throw new TradingError(409, 'TRADE_NOT_OPEN', 'Trade is no longer open')
    }

    assertManualSettlementAllowed(details.position.order.expiresAt)

    const market = await this.prisma.market.findFirst({
      where: { assetId: details.position.assetId },
      orderBy: { updatedAt: 'desc' },
      select: { lastPrice: true, lastPriceAt: true, status: true },
    })

    if (!market?.lastPrice || !market.lastPriceAt) {
      throw new TradingError(503, 'MARKET_PRICE_UNAVAILABLE', 'A current market price is required to close the trade')
    }
    this.assertFreshMarketPrice(market.lastPriceAt)

    const outcome = await this.settleTrade(tradeId, market.lastPrice, 'MANUAL')
    if (!outcome || outcome.trade.userId !== userId) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }

    const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
    await this.publishTradeSettlement(userId, result)
    return result
  }

  async settleExpiredTrades(): Promise<void> {
    const now = new Date()
    const trades = await this.prisma.trade.findMany({
      where: {
        status: 'OPEN',
        position: { status: 'OPEN', order: { expiresAt: { lte: now } } },
      },
      take: 50,
      orderBy: { openedAt: 'asc' },
      include: {
        position: { include: { order: true } },
      },
    })

    for (const trade of trades) {
      const market = await this.prisma.market.findFirst({
        where: { assetId: trade.position.assetId },
        orderBy: { updatedAt: 'desc' },
        select: { lastPrice: true, lastPriceAt: true },
      })
      if (!market?.lastPrice || !market.lastPriceAt) continue
      if (Date.now() - market.lastPriceAt.getTime() > env.trading.marketMaxAgeMs) continue

      try {
        const outcome = await this.settleTrade(trade.id, market.lastPrice, 'EXPIRY')
        if (outcome) {
          const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
          await this.publishTradeSettlement(trade.userId, result)
        }
      } catch (error) {
        this.logger.error({ err: error, tradeId: trade.id }, 'Expired trade settlement failed')
      }
    }
  }

  private async settleTrade(tradeId: string, settlementPrice: Prisma.Decimal | string, reason: 'MANUAL' | 'EXPIRY') {
    const result = await this.prisma.$transaction(async (tx) => {
      const details = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          position: { include: { order: true, asset: true } },
          settlement: true,
        },
      })

      if (!details || details.status !== 'OPEN') return null

      if (reason === 'MANUAL' && details.position.order.expiresAt) {
        assertManualSettlementAllowed(details.position.order.expiresAt, new Date())
      }

      const exitPrice = new Prisma.Decimal(settlementPrice)
      const direction = details.position.side === 'BUY' ? 'UP' : 'DOWN'
      const won = evaluateTrade(direction, details.position.entryPrice.toString(), exitPrice.toString())
      const terms = calculateSettlementTerms({
        amount: details.position.amount.toString(),
        payoutRate: details.position.order.payoutRate.toString(),
        fee: details.position.order.fee.toString(),
        won,
      })
      const settledAt = new Date()
      const tradeStatus = won ? 'WON' : 'LOST'
      const referenceId = reason.toLowerCase() + ':' + tradeId

      const claimed = await tx.trade.updateMany({
        where: { id: tradeId, status: 'OPEN' },
        data: { status: tradeStatus, grossPnl: terms.grossPnl, netPnl: terms.netPnl, closedAt: settledAt },
      })

      if (claimed.count !== 1) return null

      await tx.position.update({
        where: { id: details.position.id },
        data: { status: 'CLOSED', exitPrice, closedAt: settledAt },
      })

      const walletUpdated = await tx.wallet.updateMany({
        where: {
          accountId: details.position.accountId,
          heldBalance: { gte: terms.holdAmount },
          status: 'ACTIVE',
        },
        data: {
          heldBalance: { decrement: terms.holdAmount },
          availableBalance: { increment: terms.grossPayout },
        },
      })
      if (walletUpdated.count !== 1) {
        throw new TradingError(409, 'SETTLEMENT_BALANCE_ERROR', 'Wallet hold could not be released atomically')
      }

      let wallet = await tx.wallet.findUnique({ where: { accountId: details.position.accountId } })
      if (!wallet) throw new TradingError(409, 'WALLET_NOT_FOUND', 'Trading wallet was not found during settlement')

      const account = await tx.account.findUnique({
        where: { id: details.position.accountId },
        select: { mode: true },
      })
      if (account?.mode === 'DEMO') {
        wallet = await this.ensureDemoBalance(tx, details.position.accountId, wallet)
      }

      const settlementTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'SETTLEMENT',
          status: 'COMPLETED',
          amount: terms.grossPayout,
          currency: wallet.currency,
          idempotencyKey: 'settlement:' + tradeId,
          referenceType: 'SETTLEMENT',
          referenceId,
          description: 'Trade settlement ' + tradeId,
        },
      })

      if (terms.grossPayout.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            transactionId: settlementTx.id,
            accountId: details.position.accountId,
            walletTransactionId: settlementTx.id,
            direction: 'CREDIT',
            amount: terms.grossPayout,
            currency: wallet.currency,
            referenceType: 'SETTLEMENT',
            referenceId,
          },
        })
      }

      const settlement = await tx.settlement.upsert({
        where: { tradeId },
        create: {
          tradeId,
          status: 'COMPLETED',
          settlementPrice: exitPrice,
          grossPayout: terms.grossPayout,
          fees: terms.fee,
          netPnl: terms.netPnl,
          referenceId,
          settledAt,
        },
        update: {
          status: 'COMPLETED',
          settlementPrice: exitPrice,
          grossPayout: terms.grossPayout,
          fees: terms.fee,
          netPnl: terms.netPnl,
          referenceId,
          settledAt,
        },
      })

      return {
        trade: { ...details, status: tradeStatus, grossPnl: terms.grossPnl, netPnl: terms.netPnl, closedAt: settledAt },
        position: { ...details.position, status: 'CLOSED' as const, exitPrice, closedAt: settledAt },
        settlement,
      }
    })

    return result
  }

  async listOpenPositions(userId: string): Promise<ApiTradingPosition[]> {
    const positions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN', trade: { status: 'OPEN' } },
      orderBy: { openedAt: 'desc' },
      include: {
        order: true,
        asset: { include: { markets: { orderBy: { updatedAt: 'desc' }, take: 1 } } },
        trade: true,
      },
    })

    return positions.map((position) => {
      const market = position.asset.markets[0]
      return {
        id: position.id,
        tradeId: position.trade?.id ?? '',
        orderId: position.orderId,
        status: position.status,
        direction: position.side === 'BUY' ? 'UP' : 'DOWN',
        amount: position.amount.toString(),
        entryPrice: position.entryPrice.toString(),
        currentPrice: market?.lastPrice?.toString() ?? null,
        exitPrice: position.exitPrice?.toString() ?? null,
        payoutRate: position.order.payoutRate.toString(),
        fee: position.order.fee.toString(),
        openedAt: position.openedAt.toISOString(),
        closedAt: position.closedAt?.toISOString() ?? null,
        durationSeconds: position.order.durationSeconds ?? 0,
        expiresAt: (position.order.expiresAt ?? position.openedAt).toISOString(),
        asset: { id: position.asset.id, symbol: position.asset.symbol, name: position.asset.name },
      }
    })
  }

  private parseAmount(value: string): Prisma.Decimal {
    try {
      const amount = new Prisma.Decimal(value)
      if (!amount.isFinite() || amount.lte(0)) throw new Error('invalid')
      return amount
    } catch {
      throw new TradingError(400, 'INVALID_AMOUNT', 'Amount must be a valid positive decimal')
    }
  }

  private validateTrade(input: {
    amount: Prisma.Decimal
    durationSeconds: number
    market: { status: string; lastPrice: Prisma.Decimal | null; lastPriceAt: Date | null } | undefined
    rules: ReturnType<typeof getTradingRules>
    walletBalance: Prisma.Decimal
    now: Date
    openPositionCount: number
    openExposure: Prisma.Decimal
  }): string | null {
    if (!input.market || input.market.status !== 'OPEN') return 'Market is not open'
    if (!input.market.lastPrice || !input.market.lastPriceAt) return 'A current market price is unavailable'
    if (input.now.getTime() - input.market.lastPriceAt.getTime() > env.trading.marketMaxAgeMs) return 'The market price is stale'
    if (input.amount.lt(new Prisma.Decimal(input.rules.minAmount)) || input.amount.gt(new Prisma.Decimal(input.rules.maxAmount))) {
      return 'Amount is outside the server trading limits'
    }
    if (!TRADING_RULES.durationsSeconds.includes(input.durationSeconds as never)) return 'Duration is not allowed for this market'
    if (input.openPositionCount >= env.trading.maxOpenPositions) return 'Maximum open position limit reached'
    if (input.openExposure.plus(input.amount).gt(new Prisma.Decimal(env.trading.maxOpenExposure))) return 'Maximum open exposure limit reached'
    const fee = input.amount.mul(new Prisma.Decimal(input.rules.feeRate))
    if (input.walletBalance.lt(input.amount.plus(fee))) return 'Insufficient available balance'
    return null
  }

  private assertFreshMarketPrice(lastPriceAt: Date): void {
    if (Date.now() - lastPriceAt.getTime() > env.trading.marketMaxAgeMs) {
      throw new TradingError(409, 'STALE_MARKET_PRICE', 'The current market price is stale')
    }
  }

  private async loadTrade(tradeId: string): Promise<TradeDetails | null> {
    return this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        position: { include: { order: true, asset: true } },
        settlement: true,
      },
    }) as Promise<TradeDetails | null>
  }

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: string,
    mode: WalletMode,
  ) {
    const normalizedCurrency = currency.slice(0, 3).toUpperCase()
    const existing = await tx.account.findUnique({
      where: { userId_currency_mode: { userId, currency: normalizedCurrency, mode } },
    })

    if (existing) {
      if (existing.status !== 'ACTIVE') {
        throw new TradingError(403, 'ACCOUNT_NOT_ELIGIBLE', 'The trading account is not active')
      }
      return existing
    }

    return tx.account.create({
      data: {
        userId,
        name: mode === 'DEMO' ? 'Demo Trading Account' : 'Real Trading Account',
        currency: normalizedCurrency,
        mode,
        status: 'ACTIVE',
      },
    })
  }

  private async ensureWallet(tx: Prisma.TransactionClient, accountId: string, currency: string, seedInitialBalance: boolean) {
    const existing = await tx.wallet.findUnique({ where: { accountId } })
    if (existing) return existing
    const initialBalance = new Prisma.Decimal(env.trading.initialBalance)
    const wallet = await tx.wallet.create({
      data: {
        accountId,
        currency,
        status: 'ACTIVE',
        availableBalance: seedInitialBalance ? initialBalance : new Prisma.Decimal(0),
        heldBalance: 0,
      },
    })
    if (seedInitialBalance && initialBalance.gt(0)) {
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          status: 'COMPLETED',
          amount: initialBalance,
          currency,
          idempotencyKey: 'wallet-initial:' + wallet.id,
          referenceType: 'SYSTEM',
          referenceId: wallet.id,
          description: 'Initial demo trading balance',
        },
      })
      await tx.ledgerEntry.create({
        data: {
          transactionId: walletTransaction.id,
          accountId,
          walletTransactionId: walletTransaction.id,
          direction: 'CREDIT',
          amount: initialBalance,
          currency,
          referenceType: 'SYSTEM',
          referenceId: wallet.id,
        },
      })
    }
    return wallet
  }

  private async ensureDemoBalance(
    tx: Prisma.TransactionClient,
    accountId: string,
    wallet: Prisma.Wallet,
  ): Promise<Prisma.Wallet> {
    if (wallet.status !== 'ACTIVE' || wallet.availableBalance.gt(0) || wallet.heldBalance.gt(0)) return wallet

    const refillAmount = new Prisma.Decimal(env.trading.initialBalance)
    if (!refillAmount.gt(0)) return wallet

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
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          status: 'COMPLETED',
          amount: refillAmount,
          currency: wallet.currency,
          idempotencyKey: 'demo-trading-refill:' + wallet.id + ':' + randomUUID(),
          referenceType: 'DEMO_WALLET',
          referenceId: wallet.id,
          description: 'Demo wallet auto-refill',
        },
      })
      await tx.ledgerEntry.create({
        data: {
          transactionId: walletTransaction.id,
          accountId,
          walletTransactionId: walletTransaction.id,
          direction: 'CREDIT',
          amount: refillAmount,
          currency: wallet.currency,
          referenceType: 'DEMO_WALLET',
          referenceId: wallet.id,
        },
      })
    }

    const refreshedWallet = await tx.wallet.findUnique({ where: { id: wallet.id } })
    if (!refreshedWallet) {
      throw new TradingError(409, 'WALLET_NOT_FOUND', 'Trading wallet disappeared during demo balance refill')
    }
    return refreshedWallet
  }

  private toTradingResult(trade: TradingTradeRecord, position: TradingPositionRecord, settlement: TradingSettlementRecord | null): ApiTradingResult {
    const order = position.order
    return {
      orderId: order.id,
      tradeId: trade.id,
      positionId: position.id,
      status: trade.status,
      direction: position.side === 'BUY' ? 'UP' : 'DOWN',
      amount: position.amount.toString(),
      entryPrice: position.entryPrice.toString(),
      exitPrice: position.exitPrice?.toString() ?? settlement?.settlementPrice?.toString() ?? null,
      payoutRate: order.payoutRate.toString(),
      fee: order.fee.toString(),
      grossPnl: trade.grossPnl?.toString() ?? null,
      netPnl: trade.netPnl?.toString() ?? settlement?.netPnl?.toString() ?? null,
      openedAt: trade.openedAt.toISOString(),
      closedAt: trade.closedAt?.toISOString() ?? settlement?.settledAt?.toISOString() ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      settlementId: settlement?.id ?? null,
      settlementPrice: settlement?.settlementPrice?.toString() ?? null,
      settlementReference: settlement?.referenceId ?? null,
    }
  }

  private async publishTradeOpened(userId: string, result: ApiTradingResult): Promise<void> {
    const channel = ('user:' + userId) as `user:${string}`
    await this.publishUserEvent(createRealtimeEvent('trade.status', { tradeId: result.tradeId, orderId: result.orderId, positionId: result.positionId, status: result.status }, channel))
    await this.publishUserEvent(createRealtimeEvent('position.update', result, channel))
    await this.publishWalletEvent(userId, result.tradeId, result.positionId, channel)
  }

  private async publishTradeSettlement(userId: string, result: ApiTradingResult): Promise<void> {
    const channel = ('user:' + userId) as `user:${string}`
    await this.publishUserEvent(createRealtimeEvent('trade.status', { tradeId: result.tradeId, orderId: result.orderId, positionId: result.positionId, status: result.status, settlementId: result.settlementId }, channel))
    await this.publishUserEvent(createRealtimeEvent('position.update', result, channel))
    await this.publishWalletEvent(userId, result.tradeId, result.positionId, channel)
  }

  private async publishWalletEvent(userId: string, tradeId: string, positionId: string, channel: `user:${string}`): Promise<void> {
    const position = await this.prisma.position.findUnique({ where: { id: positionId }, select: { accountId: true, userId: true } })
    if (!position || position.userId !== userId) return
    const wallet = await this.prisma.wallet.findUnique({ where: { accountId: position.accountId } })
    if (!wallet) return
    await this.publishUserEvent(createRealtimeEvent('wallet.update', {
      tradeId,
      walletId: wallet.id,
      currency: wallet.currency,
      availableBalance: wallet.availableBalance.toString(),
      heldBalance: wallet.heldBalance.toString(),
      totalBalance: wallet.availableBalance.plus(wallet.heldBalance).toFixed(8),
    }, channel))
  }

  private async publishUserEvent(event: ReturnType<typeof createRealtimeEvent>): Promise<void> {
    if (!isRedisReady()) return
    try {
      await publish(env.redisChannel, serializeRealtimeEvent(event))
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to publish trading realtime event')
    }
  }

  private schedule(): void {
    if (!this.running) return
    this.timer = setTimeout(async () => {
      try {
        await this.settleExpiredTrades()
      } catch (error) {
        this.logger.error({ err: error }, 'Trading settlement worker failed')
      } finally {
        this.schedule()
      }
    }, env.trading.settlementIntervalMs)
    this.timer.unref?.()
  }
}
