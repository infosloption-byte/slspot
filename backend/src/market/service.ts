import type { AssetType, PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { isRedisReady, publish } from '../realtime/redis.js'
import type { MarketDataProvider } from './provider.js'
import { CANDLE_INTERVALS, isCandleInterval, type CandleInterval, type MarketDefinition } from './types.js'
import { ensureDefaultMarketRegistry } from './registry.js'

export type MarketCandleResult = {
  assetId: string
  symbol: string
  interval: CandleInterval
  candles: Array<{
    assetId: string
    symbol: string
    interval: string
    openTime: string
    closeTime: string
    open: string
    high: string
    low: string
    close: string
    volume: string
  }>
}

export type MarketDataServiceLike = Pick<MarketDataService, 'getCandles'>

export class MarketDataUnavailableError extends Error {
  readonly statusCode = 503
  readonly code = 'MARKET_DATA_UNAVAILABLE'

  constructor(message = 'Market data service is unavailable') {
    super(message)
    this.name = 'MarketDataUnavailableError'
  }
}

export class MarketDataService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private consecutiveFailures = 0

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: MarketDataProvider | null,
    private readonly logger: {
      info: (value: unknown, message?: string) => void
      warn: (value: unknown, message?: string) => void
      error: (value: unknown, message?: string) => void
    } = console,
  ) {}

  async start(): Promise<void> {
    if (env.marketData.provider !== 'disabled' && env.marketData.bootstrapAssets) {
      await ensureDefaultMarketRegistry(this.prisma, env.marketData.provider)
    }

    if (!env.marketData.enabled || env.marketData.provider === 'disabled') {
      this.logger.info({ provider: env.marketData.provider }, 'Market data service disabled')
      return
    }

    if (!this.provider) {
      this.logger.warn({ provider: env.marketData.provider }, 'Market data provider is not configured')
      return
    }

    this.running = true
    await this.poll()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async getCandles(assetId: string, intervalValue: string, limit: number): Promise<MarketCandleResult> {
    if (!this.provider || !isCandleInterval(intervalValue)) {
      throw new MarketDataUnavailableError()
    }

    const market = await this.prisma.market.findFirst({
      where: { assetId, provider: env.marketData.provider },
      include: { asset: true },
    })

    if (!market || !market.asset.isActive) {
      throw new MarketDataUnavailableError('Market asset is not configured')
    }

    const definition: MarketDefinition = {
      assetId: market.assetId,
      assetType: market.asset.type,
      symbol: market.asset.symbol,
      provider: market.provider,
      externalSymbol: market.externalSymbol,
    }

    const candles = await this.provider.candles(
      definition,
      intervalValue as CandleInterval,
      Math.min(5000, Math.max(1, limit)),
    )

    return {
      assetId: market.assetId,
      symbol: market.asset.symbol,
      interval: intervalValue as CandleInterval,
      candles: candles.map((candle) => ({
        assetId: market.assetId,
        symbol: market.asset.symbol,
        interval: candle.interval,
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.provider) return

    try {
      const markets = await this.prisma.market.findMany({
        where: {
          provider: env.marketData.provider,
          asset: { isActive: true },
        },
        include: { asset: true },
        orderBy: { updatedAt: 'asc' },
      })

      const results = await Promise.allSettled(markets.map((market) => this.updateMarket(market)))
      const failures = results.filter((result) => result.status === 'rejected').length
      this.consecutiveFailures = failures > 0 ? this.consecutiveFailures + 1 : 0

      const backoff = failures > 0
        ? Math.min(
          env.marketData.pollIntervalMs * Math.pow(2, Math.min(this.consecutiveFailures, 5)),
          300_000,
        )
        : env.marketData.pollIntervalMs

      this.timer = setTimeout(() => void this.poll(), backoff)
      this.timer.unref?.()

      if (failures > 0) {
        this.logger.warn({ failures, backoff }, 'Market data poll completed with failures')
      } else {
        this.logger.info({ markets: markets.length }, 'Market data poll completed')
      }
    } catch (error) {
      this.consecutiveFailures += 1
      const backoff = Math.min(
        env.marketData.pollIntervalMs * Math.pow(2, Math.min(this.consecutiveFailures, 5)),
        300_000,
      )
      this.logger.error({ err: error, backoff }, 'Market data poll failed')
      this.timer = setTimeout(() => void this.poll(), backoff)
      this.timer.unref?.()
    }
  }

  private async updateMarket(market: {
    assetId: string
    provider: string
    externalSymbol: string
    asset: { id: string; symbol: string; type: AssetType }
  }): Promise<void> {
    const definition = {
      assetId: market.assetId,
      assetType: market.asset.type,
      symbol: market.asset.symbol,
      provider: market.provider,
      externalSymbol: market.externalSymbol,
    } satisfies MarketDefinition

    try {
      const quote = await this.provider!.quote(definition)

      await this.prisma.market.update({
        where: {
          provider_externalSymbol: {
            provider: market.provider,
            externalSymbol: market.externalSymbol,
          },
        },
        data: {
          status: quote.status,
          lastPrice: quote.last,
          lastPriceAt: new Date(quote.timestamp),
        },
      })

      const channel = ('market:' + market.assetId) as `market:${string}`

      await this.publishEvent(createRealtimeEvent('market.price', {
        assetId: market.assetId,
        symbol: market.asset.symbol,
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        changePct: quote.changePct,
        volume: quote.volume,
        timestamp: quote.timestamp,
      }, channel))

      await this.publishEvent(createRealtimeEvent('market.status', {
        assetId: market.assetId,
        symbol: market.asset.symbol,
        status: quote.status.toLowerCase(),
        timestamp: quote.timestamp,
      }, channel))
    } catch (error) {
      await this.prisma.market.update({
        where: {
          provider_externalSymbol: {
            provider: market.provider,
            externalSymbol: market.externalSymbol,
          },
        },
        data: { status: 'MAINTENANCE' },
      }).catch(() => undefined)

      const channel = ('market:' + market.assetId) as `market:${string}`
      await this.publishEvent(createRealtimeEvent('market.status', {
        assetId: market.assetId,
        symbol: market.asset.symbol,
        status: 'maintenance',
        timestamp: new Date().toISOString(),
      }, channel))

      throw error
    }
  }

  private async publishEvent(event: ReturnType<typeof createRealtimeEvent>): Promise<void> {
    if (!isRedisReady()) return

    try {
      await publish(env.redisChannel, serializeRealtimeEvent(event))
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to publish market realtime event')
    }
  }
}


export { CANDLE_INTERVALS }
