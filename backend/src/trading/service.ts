import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient, type Wallet } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { getPreferredLivePrice } from '../market/live-prices.js'
import { resolveSettlementPrice } from './settlementPrice.js'
import { shouldVoidUnpricedTrade, voidNotification } from './voidPolicy.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { publishRealtime } from '../realtime/bus.js'
import { getTradingRules, TRADING_RULES } from './config.js'
import { LedgerService } from '../ledger/service.js'
import { EmailService } from '../email/service.js'

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
  orderStatus: string
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
  entryProvider: string | null
  entryTimestamp: string | null
  settlementProvider: string | null
  settlementTimestamp: string | null
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

export type TradeOutcome = 'WON' | 'LOST' | 'DRAW'

/** An exit price equal to the entry price is a draw: the stake is returned with no profit. */
export function evaluateTrade(direction: TradeDirection, entryPrice: string, exitPrice: string): TradeOutcome {
  const entry = new Prisma.Decimal(entryPrice)
  const exit = new Prisma.Decimal(exitPrice)
  if (exit.eq(entry)) return 'DRAW'
  const won = direction === 'UP' ? exit.gt(entry) : exit.lt(entry)
  return won ? 'WON' : 'LOST'
}

export function calculateSettlementTerms(input: {
  amount: string
  payoutRate: string
  fee: string
  outcome: TradeOutcome
}) {
  const amount = new Prisma.Decimal(input.amount)
  const payoutRate = new Prisma.Decimal(input.payoutRate)
  const fee = new Prisma.Decimal(input.fee)
  const zero = new Prisma.Decimal(0)
  const profit = input.outcome === 'WON' ? amount.mul(payoutRate) : zero
  const grossPnl = input.outcome === 'WON' ? profit : input.outcome === 'DRAW' ? zero : amount.neg()
  const grossPayout = input.outcome === 'WON' ? amount.plus(profit) : input.outcome === 'DRAW' ? amount : zero
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
  entryProvider: string | null
  entryTimestamp: Date | null
  openedAt: Date
  closedAt: Date | null
}

type TradingPositionRecord = {
  id: string
  userId: string
  accountId: string
  assetId: string
  side: 'BUY' | 'SELL'
  status: 'OPEN' | 'CLOSED'
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
  entryPrice: Prisma.Decimal | null
  entryProvider: string | null
  entryTimestamp: Date | null
  settlementProvider: string | null
  settlementTimestamp: Date | null
  referenceId: string | null
  netPnl: Prisma.Decimal | null
  settledAt: Date | null
}

type TradeDetails = {
  trade: TradingTradeRecord
  position: TradingPositionRecord
  settlement: TradingSettlementRecord | null
}

type TradingMarketSnapshot = {
  status: string
  lastPrice: Prisma.Decimal | null
  lastPriceAt: Date | null
  lastPriceProvider?: string | null
}

export class TradingService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private readonly ledger: LedgerService
  private readonly email = new EmailService()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: {
      info: (value: unknown, message?: string) => void
      warn: (value: unknown, message?: string) => void
      error: (value: unknown, message?: string) => void
    } = console,
  ) {
    this.ledger = new LedgerService(prisma)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    // Recover every already-expired trade in batches before normal scheduling. The browser is
    // never authoritative for expiry, so a server restart or client outage cannot strand funds.
    for (;;) {
      const settled = await this.settleExpiredTrades()
      // Stop only when this pass could not recover any expired trade. If market data for
      // a REAL trade is temporarily unavailable, later scheduler passes will retry it.
      if (settled === 0) break
    }
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
        account: { select: { mode: true } },
        position: {
          include: {
            asset: true,
            order: true,
            trade: { include: { settlement: true } },
          },
        },
      },
    })

    const requestedAmount = this.parseAmount(input.amount)
    const requestedSide = input.direction === 'UP' ? 'BUY' : 'SELL'

    if (existing) {
      const replayMatches =
        existing.userId === userId &&
        existing.account.mode === mode &&
        existing.assetId === input.assetId &&
        existing.side === requestedSide &&
        existing.amount.eq(requestedAmount) &&
        existing.durationSeconds === input.durationSeconds

      if (!replayMatches) {
        throw new TradingError(409, 'IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different trade request')
      }
      if (existing.position?.trade) {
        return this.toTradingResult(existing.position.trade, existing.position, existing.position.trade.settlement)
      }
      throw new TradingError(409, 'ORDER_ALREADY_EXISTS', 'The order already exists')
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

        const market = this.withLivePrice(asset.id, asset.markets[0])
        const now = new Date()
        const marketIsFresh = Boolean(
          market?.status === 'OPEN' &&
          market.lastPrice &&
          market.lastPriceAt &&
          now.getTime() - market.lastPriceAt.getTime() <= env.trading.marketMaxAgeMs,
        )
        // Trades are priced only from the live exchange feed, in demo and real mode alike.
        const marketForTrade: TradingMarketSnapshot | undefined = market
        const rules = getTradingRules(asset.symbol, marketIsFresh)
        const account = await this.ensureAccount(tx, userId, asset.quoteCurrency ?? 'USD', mode)
        let wallet = await this.ensureWallet(tx, account.id, account.currency, mode === 'DEMO')
        if (mode === 'DEMO') wallet = await this.ensureDemoBalance(tx, account.id, wallet)
        if (wallet.status !== 'ACTIVE') {
          throw new TradingError(403, 'WALLET_NOT_ELIGIBLE', 'The trading wallet is not active')
        }

        const amount = requestedAmount
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
          market: marketForTrade,
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
            requestedPrice: marketForTrade?.lastPrice ?? null,
            payoutRate,
            fee,
            durationSeconds: input.durationSeconds,
            expiresAt: rejection ? null : new Date(now.getTime() + input.durationSeconds * 1000),
            rejectionReason: rejection,
          },
        })

        if (rejection) {
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              action: 'TRADE_REJECTED',
              entityType: 'Order',
              entityId: order.id,
              metadata: { reason: rejection, mode, clientRequestId: requestId },
            },
          })
          return { kind: 'rejected' as const, order, asset }
        }

        const held = await tx.wallet.updateMany({
          where: {
            id: wallet!.id,
            status: 'ACTIVE',
            availableBalance: { gte: holdAmount },
          },
          data: {
            availableBalance: { decrement: holdAmount },
            heldBalance: { increment: holdAmount },
          },
        })

        if (held.count !== 1) {
          const rejected = await tx.order.update({
            where: { id: order.id },
            data: { status: 'REJECTED', rejectionReason: 'Insufficient available balance' },
          })
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              action: 'TRADE_REJECTED',
              entityType: 'Order',
              entityId: order.id,
              metadata: { reason: 'Insufficient available balance', mode, clientRequestId: requestId },
            },
          })
          return { kind: 'rejected' as const, order: rejected, asset }
        }

        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'ACCEPTED',
            executedPrice: marketForTrade!.lastPrice!,
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
            entryPrice: marketForTrade!.lastPrice!,
          },
        })

        const trade = await tx.trade.create({
          data: {
            positionId: position.id,
            userId,
            status: 'OPEN',
            fee,
            entryProvider: marketForTrade?.lastPriceProvider ?? null,
            entryTimestamp: marketForTrade?.lastPriceAt ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'TRADE_OPENED',
            entityType: 'Trade',
            entityId: trade.id,
            metadata: { mode, clientRequestId: requestId, orderId: order.id, amount: amount.toString(), durationSeconds: input.durationSeconds },
          },
        })

        if (fee.gt(0)) {
          const feeClaim = await tx.wallet.updateMany({
            where: {
              id: wallet!.id,
              status: 'ACTIVE',
              availableBalance: { gte: fee },
            },
            data: { availableBalance: { decrement: fee } },
          })
          if (feeClaim.count !== 1) {
            throw new TradingError(409, 'FEE_BALANCE_ERROR', 'Trading fee could not be reserved atomically')
          }
        }

        const heldWallet = await tx.wallet.findUnique({ where: { id: wallet!.id } })
        if (!heldWallet) throw new TradingError(409, 'WALLET_NOT_FOUND', 'Trading wallet disappeared after reserving trade funds')

        const ledgerAccounts = await this.ledger.ensureWalletLedgerAccounts(tx, account.id, wallet!.currency)

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
            availableBalanceAfter: heldWallet.availableBalance,
            heldBalanceAfter: heldWallet.heldBalance,
          },
        })

        await this.ledger.postTransaction(tx, {
          walletTransactionId: holdTx.id,
          currency: wallet!.currency,
          referenceType: 'TRADE_HOLD',
          referenceId: trade.id,
          description: 'Hold funds for trade ' + trade.id,
          lines: [
            {
              accountCode: ledgerAccounts.availableCode,
              accountName: 'User available balance',
              accountType: 'LIABILITY',
              direction: 'DEBIT',
              amount: holdAmount,
            },
            {
              accountCode: ledgerAccounts.heldCode,
              accountName: 'User held balance',
              accountType: 'LIABILITY',
              direction: 'CREDIT',
              amount: holdAmount,
            },
          ],
        })

        if (fee.gt(0)) {
          const feeWallet = await tx.wallet.findUnique({ where: { id: wallet!.id } })
          if (!feeWallet) throw new TradingError(409, 'WALLET_NOT_FOUND', 'Trading wallet disappeared while reserving fee')
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
              availableBalanceAfter: feeWallet.availableBalance,
              heldBalanceAfter: feeWallet.heldBalance,
            },
          })

          const feeAccountCode = await this.ledger.ensureSystemLedgerAccount(
            tx,
            'SYSTEM:TRADE_FEES',
            'Trading fee revenue',
            'REVENUE',
            wallet!.currency,
          )

          await this.ledger.postTransaction(tx, {
            walletTransactionId: feeTx.id,
            currency: wallet!.currency,
            referenceType: 'FEE',
            referenceId: trade.id,
            description: 'Trading fee for ' + trade.id,
            lines: [
              {
                accountCode: ledgerAccounts.availableCode,
                accountName: 'User available balance',
                accountType: 'LIABILITY',
                direction: 'DEBIT',
                amount: fee,
              },
              {
                accountCode: feeAccountCode,
                accountName: 'Trading fee revenue',
                accountType: 'REVENUE',
                direction: 'CREDIT',
                amount: fee,
              },
            ],
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
            account: { select: { mode: true } },
            position: {
              include: {
                asset: true,
                order: true,
                trade: { include: { settlement: true } },
              },
            },
          },
        })
        if (retry) {
          const replayMatches =
            retry.userId === userId &&
            retry.account.mode === mode &&
            retry.assetId === input.assetId &&
            retry.side === requestedSide &&
            retry.amount.eq(requestedAmount) &&
            retry.durationSeconds === input.durationSeconds
          if (!replayMatches) {
            throw new TradingError(409, 'IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different trade request')
          }
          if (retry.position?.trade) {
            return this.toTradingResult(retry.position.trade, retry.position, retry.position.trade.settlement)
          }
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

    const market = this.withLivePrice(details.position.assetId, await this.prisma.market.findFirst({
      where: { assetId: details.position.assetId },
      orderBy: { updatedAt: 'desc' },
      select: { lastPrice: true, lastPriceAt: true, status: true, lastPriceProvider: true },
    }) ?? undefined)

    const resolved = resolveSettlementPrice({
      assetId: details.position.assetId,
      symbol: details.position.asset.symbol,
      expiresAt: details.position.order.expiresAt,
      market,
      maxAgeMs: env.trading.marketMaxAgeMs,
      onLateFallback: (late) => this.logger.warn(late, 'Settling at the current price: no tick history covers the expiry instant'),
    })
    if (!resolved) {
      throw new TradingError(503, 'MARKET_PRICE_UNAVAILABLE', 'A current market price is required to close the trade')
    }

    const settlementPrice = resolved.price
    const settlementProvider = resolved.provider
    const settlementTimestamp = resolved.timestamp
    const outcome = await this.settleTrade(tradeId, settlementPrice, 'MANUAL', settlementProvider, settlementTimestamp)
    if (!outcome || outcome.trade.userId !== userId) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }

    const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
    await this.publishTradeSettlement(userId, result)
    await this.createTradeResultNotification(userId, result, outcome.position.asset.symbol)
    return result
  }

  async settleExpiredTrades(): Promise<number> {
    const now = new Date()
    let settledCount = 0
    const trades = await this.prisma.trade.findMany({
      where: {
        status: 'OPEN',
        position: { status: 'OPEN', order: { expiresAt: { lte: now } } },
      },
      take: 50,
      orderBy: { openedAt: 'asc' },
      include: {
        position: { include: { order: true, asset: true } },
      },
    })

    for (const trade of trades) {
      const market = this.withLivePrice(trade.position.assetId, await this.prisma.market.findFirst({
        where: { assetId: trade.position.assetId },
        orderBy: { updatedAt: 'desc' },
        select: { lastPrice: true, lastPriceAt: true, lastPriceProvider: true },
      }) ?? undefined)
      const account = await this.prisma.account.findUnique({
        where: { id: trade.position.accountId },
        select: { mode: true },
      })
      const resolved = resolveSettlementPrice({
        assetId: trade.position.assetId,
        symbol: trade.position.asset.symbol,
        expiresAt: trade.position.order.expiresAt,
        market,
        maxAgeMs: env.trading.marketMaxAgeMs,
        onLateFallback: (late) => this.logger.warn(late, 'Settling at the current price: no tick history covers the expiry instant'),
      })
      if (!resolved) {
        // No reliable live price (demo and real alike; prices are never guessed). After the grace
        // period the trade is voided and refunded instead of staying open forever.
        if (shouldVoidUnpricedTrade({ expiresAt: trade.position.order.expiresAt, now: Date.now(), voidAfterMs: env.trading.voidAfterMs })) {
          try {
            await this.voidUnpricedTrade(trade.id, trade.position.asset.symbol, account?.mode === 'DEMO' ? 'DEMO' : 'REAL')
          } catch (error) {
            this.logger.error({ err: error, tradeId: trade.id }, 'Voiding an unpriced expired trade failed')
          }
        }
        continue
      }

      try {
        const outcome = await this.settleTrade(trade.id, resolved.price, 'EXPIRY', resolved.provider, resolved.timestamp)
        if (outcome) {
          settledCount += 1
          const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
          await this.publishTradeSettlement(trade.userId, result)
          await this.createTradeResultNotification(trade.userId, result, outcome.position.asset.symbol)
        }
      } catch (error) {
        this.logger.error({ err: error, tradeId: trade.id }, 'Expired trade settlement failed')
      }
    }

    return settledCount
  }

  async cancelTrade(userId: string, tradeId: string, mode: WalletMode = 'DEMO'): Promise<ApiTradingResult> {
    const details = await this.loadTrade(tradeId)
    if (!details || details.trade.userId !== userId) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }

    const account = await this.prisma.account.findUnique({
      where: { id: details.position.accountId },
      select: { mode: true },
    })
    if (!account || account.mode !== mode) {
      throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
    }

    if (details.trade.status !== 'OPEN' || details.position.status !== 'OPEN' || details.position.order.status !== 'ACCEPTED') {
      return this.toTradingResult(details.trade, details.position, details.settlement)
    }

    const outcome = await this.cancelOpenTrade(tradeId, { userId, mode, kind: 'USER' })

    if (!outcome) {
      const latest = await this.loadTrade(tradeId)
      if (!latest || latest.trade.userId !== userId) throw new TradingError(404, 'TRADE_NOT_FOUND', 'Trade was not found')
      return this.toTradingResult(latest.trade, latest.position, latest.settlement)
    }

    const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
    await this.publishTradeSettlement(userId, result)
    await this.createTradeResultNotification(userId, result, outcome.position.asset.symbol)
    return result
  }

  /**
   * Voids an expired trade that could not be priced: the full stake is returned and the
   * user is told why through a notification (and a realtime event for the open app).
   */
  private async voidUnpricedTrade(tradeId: string, symbol: string, mode: WalletMode): Promise<boolean> {
    const outcome = await this.cancelOpenTrade(tradeId, { userId: null, mode, kind: 'NO_PRICE' })
    if (!outcome) return false

    this.logger.error(
      { tradeId, symbol, stake: outcome.position.amount.toString() },
      'Trade voided and refunded: no reliable market price was available after expiry',
    )
    const result = this.toTradingResult(outcome.trade, outcome.position, outcome.settlement)
    await this.publishTradeSettlement(outcome.trade.userId, result)
    await this.createTradeResultNotification(outcome.trade.userId, result, symbol, voidNotification({
      symbol,
      direction: result.direction,
      amount: outcome.position.amount.toString(),
      currency: outcome.currency,
    }))
    return true
  }

  /**
   * Cancels an open trade and returns the stake. Used both for a user cancelling before expiry and for
   * the system voiding an expired trade it could not price (the stake is refunded in full either way).
   */
  private async cancelOpenTrade(
    tradeId: string,
    opts: { userId: string | null; mode: WalletMode | null; kind: 'USER' | 'NO_PRICE' },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          position: { include: { order: true, asset: true } },
          settlement: true,
        },
      })
      if (!current || (opts.userId !== null && current.userId !== opts.userId) || current.status !== 'OPEN' || current.position.status !== 'OPEN' || current.position.order.status !== 'ACCEPTED') return null
      const expired = Boolean(current.position.order.expiresAt && current.position.order.expiresAt.getTime() <= Date.now())
      if (opts.kind === 'USER' && expired) {
        throw new TradingError(409, 'TRADE_EXPIRED', 'This trade has already expired and is being settled')
      }
      // A system void only applies to trades that really are past expiry.
      if (opts.kind === 'NO_PRICE' && !expired) return null

      const now = new Date()
      const amount = current.position.amount
      const fee = current.position.order.fee
      const netPnl = fee.neg()

      const claimed = await tx.trade.updateMany({
        where: { id: tradeId, status: 'OPEN' },
        data: { status: 'CANCELLED', grossPnl: new Prisma.Decimal(0), netPnl, closedAt: now },
      })
      if (claimed.count !== 1) return null

      await tx.position.update({
        where: { id: current.position.id },
        data: { status: 'CLOSED', closedAt: now },
      })
      await tx.order.update({
        where: { id: current.position.order.id },
        data: { status: 'CANCELLED' },
      })

      const walletUpdated = await tx.wallet.updateMany({
        where: {
          accountId: current.position.accountId,
          status: 'ACTIVE',
          heldBalance: { gte: amount },
        },
        data: {
          heldBalance: { decrement: amount },
          availableBalance: { increment: amount },
        },
      })
      if (walletUpdated.count !== 1) {
        throw new TradingError(409, 'CANCEL_BALANCE_ERROR', 'The trade stake could not be released atomically')
      }

      const wallet = await tx.wallet.findUnique({ where: { accountId: current.position.accountId } })
      if (!wallet) throw new TradingError(409, 'WALLET_NOT_FOUND', 'Trading wallet was not found during cancellation')

      const walletLedger = await this.ledger.ensureWalletLedgerAccounts(tx, current.position.accountId, wallet.currency)
      const releaseTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TRADE_RELEASE',
          status: 'COMPLETED',
          amount,
          currency: wallet.currency,
          idempotencyKey: 'trade-release:' + tradeId,
          referenceType: opts.kind === 'USER' ? 'TRADE_CANCEL' : 'TRADE_VOID',
          referenceId: tradeId,
          description: (opts.kind === 'USER' ? 'Released stake for cancelled trade ' : 'Refunded stake for voided trade (no reliable price at expiry) ') + tradeId,
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })

      await this.ledger.postTransaction(tx, {
        walletTransactionId: releaseTx.id,
        currency: wallet.currency,
        referenceType: opts.kind === 'USER' ? 'TRADE_CANCEL' : 'TRADE_VOID',
        referenceId: tradeId,
        description: (opts.kind === 'USER' ? 'Released stake for cancelled trade ' : 'Refunded stake for voided trade (no reliable price at expiry) ') + tradeId,
        lines: [
          {
            accountCode: walletLedger.heldCode,
            accountName: 'User held balance',
            accountType: 'LIABILITY',
            direction: 'DEBIT',
            amount,
          },
          {
            accountCode: walletLedger.availableCode,
            accountName: 'User available balance',
            accountType: 'LIABILITY',
            direction: 'CREDIT',
            amount,
          },
        ],
      })

      const settlement = await tx.settlement.upsert({
        where: { tradeId },
        create: {
          tradeId,
          status: 'COMPLETED',
          settlementPrice: null,
          entryPrice: current.position.entryPrice,
          entryProvider: current.entryProvider,
          entryTimestamp: current.entryTimestamp,
          settlementProvider: null,
          settlementTimestamp: null,
          grossPayout: amount,
          fees: fee,
          netPnl,
          referenceId: (opts.kind === 'USER' ? 'cancel:' : 'void:') + tradeId,
          settledAt: now,
        },
        update: {
          status: 'COMPLETED',
          settlementPrice: null,
          entryPrice: current.position.entryPrice,
          entryProvider: current.entryProvider,
          entryTimestamp: current.entryTimestamp,
          settlementProvider: null,
          settlementTimestamp: null,
          grossPayout: amount,
          fees: fee,
          netPnl,
          referenceId: (opts.kind === 'USER' ? 'cancel:' : 'void:') + tradeId,
          settledAt: now,
        },
      })

      await tx.auditLog.create({
        data: {
          actorUserId: current.userId,
          action: opts.kind === 'USER' ? 'TRADE_CANCELLED' : 'TRADE_VOIDED_NO_PRICE',
          entityType: 'Trade',
          entityId: tradeId,
          metadata: { mode: opts.mode, amount: amount.toString(), fee: fee.toString(), ...(opts.kind === 'NO_PRICE' ? { reason: 'No reliable market price at expiry' } : {}) },
        },
      })

      return {
        trade: { ...current, status: 'CANCELLED' as const, grossPnl: new Prisma.Decimal(0), netPnl, closedAt: now },
        position: { ...current.position, status: 'CLOSED' as const, exitPrice: null, closedAt: now },
        settlement,
        currency: wallet.currency,
      }
    })
  }

  private async settleTrade(tradeId: string, settlementPrice: Prisma.Decimal | string, reason: 'MANUAL' | 'EXPIRY', settlementProvider = 'unknown', settlementTimestamp = new Date()) {
    const result = await this.prisma.$transaction(async (tx) => {
      const details = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          position: { include: { order: true, asset: true } },
          settlement: true,
        },
      })

      if (!details || details.status !== 'OPEN' || details.position.status !== 'OPEN' || details.position.order.status !== 'ACCEPTED') return null

      if (reason === 'MANUAL' && details.position.order.expiresAt) {
        assertManualSettlementAllowed(details.position.order.expiresAt, new Date())
      }

      const exitPrice = new Prisma.Decimal(settlementPrice)
      const direction = details.position.side === 'BUY' ? 'UP' : 'DOWN'
      const outcome = evaluateTrade(direction, details.position.entryPrice.toString(), exitPrice.toString())
      const terms = calculateSettlementTerms({
        amount: details.position.amount.toString(),
        payoutRate: details.position.order.payoutRate.toString(),
        fee: details.position.order.fee.toString(),
        outcome,
      })
      const settledAt = new Date()
      const tradeStatus = outcome
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
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })

      const settlementAccountCode = await this.ledger.ensureSystemLedgerAccount(
        tx,
        'SYSTEM:TRADE_SETTLEMENT',
        'Trade settlement house result',
        'EQUITY',
        wallet.currency,
      )
      const walletLedger = await this.ledger.ensureWalletLedgerAccounts(tx, details.position.accountId, wallet.currency)
      const settlementLines = outcome === 'DRAW'
        ? [
            {
              accountCode: walletLedger.heldCode,
              accountName: 'User held balance',
              accountType: 'LIABILITY' as const,
              direction: 'DEBIT' as const,
              amount: terms.holdAmount,
            },
            {
              accountCode: walletLedger.availableCode,
              accountName: 'User available balance',
              accountType: 'LIABILITY' as const,
              direction: 'CREDIT' as const,
              amount: terms.grossPayout,
            },
          ]
        : outcome === 'WON'
        ? [
            {
              accountCode: walletLedger.heldCode,
              accountName: 'User held balance',
              accountType: 'LIABILITY' as const,
              direction: 'DEBIT' as const,
              amount: terms.holdAmount,
            },
            {
              accountCode: settlementAccountCode,
              accountName: 'Trade settlement house result',
              accountType: 'EQUITY' as const,
              direction: 'DEBIT' as const,
              amount: terms.profit,
            },
            {
              accountCode: walletLedger.availableCode,
              accountName: 'User available balance',
              accountType: 'LIABILITY' as const,
              direction: 'CREDIT' as const,
              amount: terms.grossPayout,
            },
          ]
        : [
            {
              accountCode: walletLedger.heldCode,
              accountName: 'User held balance',
              accountType: 'LIABILITY' as const,
              direction: 'DEBIT' as const,
              amount: terms.holdAmount,
            },
            {
              accountCode: settlementAccountCode,
              accountName: 'Trade settlement house result',
              accountType: 'EQUITY' as const,
              direction: 'CREDIT' as const,
              amount: terms.holdAmount,
            },
          ]

      await this.ledger.postTransaction(tx, {
        walletTransactionId: settlementTx.id,
        currency: wallet.currency,
        referenceType: 'SETTLEMENT',
        referenceId,
        description: 'Trade settlement ' + tradeId,
        lines: settlementLines,
      })

      const settlement = await tx.settlement.upsert({
        where: { tradeId },
        create: {
          tradeId,
          status: 'COMPLETED',
          settlementPrice: exitPrice,
          entryPrice: details.position.entryPrice,
          entryProvider: details.entryProvider,
          entryTimestamp: details.entryTimestamp,
          settlementProvider,
          settlementTimestamp,
          grossPayout: terms.grossPayout,
          fees: terms.fee,
          netPnl: terms.netPnl,
          referenceId,
          settledAt,
        },
        update: {
          status: 'COMPLETED',
          settlementPrice: exitPrice,
          entryPrice: details.position.entryPrice,
          entryProvider: details.entryProvider,
          entryTimestamp: details.entryTimestamp,
          settlementProvider,
          settlementTimestamp,
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
        currentPrice: (this.withLivePrice(position.assetId, market)?.lastPrice ?? market?.lastPrice)?.toString() ?? null,
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

  /** Prefers the newest live Binance tick over the stored market snapshot. */
  private withLivePrice<T extends { lastPrice: Prisma.Decimal | null; lastPriceAt: Date | null; status?: string; lastPriceProvider?: string | null }>(
    assetId: string,
    market: T | undefined,
  ): T | undefined {
    const live = getPreferredLivePrice(assetId, env.trading.marketMaxAgeMs, ['binance'])
    if (!live) return market
    if (market?.lastPriceAt && market.lastPriceAt.getTime() >= live.at) return market
    return {
      ...(market ?? ({} as T)),
      lastPrice: new Prisma.Decimal(live.price),
      lastPriceAt: new Date(live.at),
      lastPriceProvider: live.provider,
      ...(market?.status !== undefined || !market ? { status: 'OPEN' } : {}),
    } as T
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
      const ledgerAccounts = await this.ledger.ensureWalletLedgerAccounts(tx, accountId, currency)
      const fundingCode = await this.ledger.ensureSystemLedgerAccount(
        tx,
        'SYSTEM:DEMO_FUNDING',
        'Demo funding source',
        'EQUITY',
        currency,
      )
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
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })
      await this.ledger.postTransaction(tx, {
        walletTransactionId: walletTransaction.id,
        currency,
        referenceType: 'SYSTEM',
        referenceId: wallet.id,
        description: 'Initial demo trading balance',
        lines: [
          { accountCode: fundingCode, accountName: 'Demo funding source', accountType: 'EQUITY', direction: 'DEBIT', amount: initialBalance },
          { accountCode: ledgerAccounts.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'CREDIT', amount: initialBalance },
        ],
      })
    }
    return wallet
  }

  private async ensureDemoBalance (
    tx: Prisma.TransactionClient,
    accountId: string,
    wallet: Wallet,
  ): Promise<Wallet> {
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
      const ledgerAccounts = await this.ledger.ensureWalletLedgerAccounts(tx, accountId, wallet.currency)
      const fundingCode = await this.ledger.ensureSystemLedgerAccount(
        tx,
        'SYSTEM:DEMO_FUNDING',
        'Demo funding source',
        'EQUITY',
        wallet.currency,
      )
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
          availableBalanceAfter: wallet.availableBalance.add(refillAmount),
          heldBalanceAfter: wallet.heldBalance,
        },
      })
      await this.ledger.postTransaction(tx, {
        walletTransactionId: walletTransaction.id,
        currency: wallet.currency,
        referenceType: 'DEMO_WALLET',
        referenceId: wallet.id,
        description: 'Demo wallet auto-refill',
        lines: [
          { accountCode: fundingCode, accountName: 'Demo funding source', accountType: 'EQUITY', direction: 'DEBIT', amount: refillAmount },
          { accountCode: ledgerAccounts.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'CREDIT', amount: refillAmount },
        ],
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
      orderStatus: order.status,
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
      entryProvider: trade.entryProvider ?? null,
      entryTimestamp: trade.entryTimestamp?.toISOString() ?? null,
      settlementProvider: settlement?.settlementProvider ?? null,
      settlementTimestamp: settlement?.settlementTimestamp?.toISOString() ?? null,
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

  private async createTradeResultNotification(
    userId: string,
    result: ApiTradingResult,
    symbol: string,
    override?: { title: string; body: string; type?: 'SYSTEM' | 'TRADE_RESULT' },
  ): Promise<void> {
    const title = override?.title ?? (result.status === 'WON' ? 'Trade won' : result.status === 'DRAW' ? 'Trade draw: stake returned' : result.status === 'CANCELLED' ? 'Trade cancelled: stake returned' : 'Trade settled')
    const pnl = result.netPnl ?? '0'
    const message = override?.body ?? (symbol + ' · ' + result.direction + ' · P&L ' + (Number(pnl) >= 0 ? '+' : '') + pnl)

    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          type: override?.type ?? 'TRADE_RESULT',
          title,
          body: message,
        },
      })
      const channel = ('user:' + userId) as `user:${string}`
      await this.publishUserEvent(createRealtimeEvent('notification.created', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        readAt: null,
        createdAt: notification.createdAt.toISOString(),
      }, channel))
      const [user, preferences] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
        this.prisma.userPreference.findUnique({ where: { userId }, select: { emailTradeResults: true } }),
      ])
      if (user && preferences?.emailTradeResults !== false && notification.type === 'TRADE_RESULT') {
        try {
          await this.email.sendNotification(user.email, notification.id, notification.title, notification.body, 'trade_result')
        } catch (error) {
          this.logger.warn({ err: error, tradeId: result.tradeId }, 'Failed to send trade result email')
        }
      }
    } catch (error) {
      this.logger.warn({ err: error, tradeId: result.tradeId }, 'Failed to create trade result notification')
    }
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
    try {
      await publishRealtime(serializeRealtimeEvent(event))
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
