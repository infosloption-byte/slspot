import type { AssetType, PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { publishRealtime } from '../realtime/bus.js'
import type { MarketDataProvider } from './provider.js'
import { CANDLE_INTERVALS, isCandleInterval, type CandleInterval, type MarketDefinition } from './types.js'
import { ensureDefaultMarketRegistry } from './registry.js'
import { DEMO_PRICE_BASES, DemoPriceSimulator } from '../trading/demoPrice.js'

const SIMULATION_INTERVAL_MS = 2_000

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
  private simulationTimer: ReturnType<typeof setInterval> | null = null
  private simulationRunning = false
  private readonly simulator = new DemoPriceSimulator()
  private readonly simulationAnchors = new Map<string, number>()
  /** Assets currently priced by the simulation rather than the live provider. */
  private readonly simulatedAssets = new Set<string>()

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
    if ((env.marketData.provider !== 'disabled' || env.marketData.simulate) && env.marketData.bootstrapAssets) {
      await ensureDefaultMarketRegistry(this.prisma, env.marketData.provider)
    }

    if (env.marketData.simulate) this.startSimulation()

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
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer)
      this.simulationTimer = null
    }
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

    let candles: Awaited<ReturnType<MarketDataProvider['candles']>>

    try {
      candles = await this.provider.candles(
        definition,
        intervalValue as CandleInterval,
        Math.min(5000, Math.max(1, limit)),
      )
    } catch (error) {
      this.logger.warn(
        { err: error, assetId: market.assetId, symbol: market.asset.symbol, interval: intervalValue },
        'Market candle provider request failed',
      )

      if (env.nodeEnv !== 'production') {
        return {
          assetId: market.assetId,
          symbol: market.asset.symbol,
          interval: intervalValue as CandleInterval,
          candles: [],
        }
      }

      throw new MarketDataUnavailableError('Market data provider request failed')
    }

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

  /**
   * Development fallback: keeps every active market priced (and ticking over the WebSocket)
   * when there is no live provider, or when the provider is failing, for example because the
   * API key is missing or the free plan is rate limited. Without it `lastPrice` stays null and
   * the UI shows no prices. Disabled in production by the env validation.
   */
  private startSimulation(): void {
    if (this.simulationTimer) return
    this.logger.info({ intervalMs: SIMULATION_INTERVAL_MS }, 'Simulated market prices enabled (non-production)')
    void this.simulateTick()
    this.simulationTimer = setInterval(() => void this.simulateTick(), SIMULATION_INTERVAL_MS)
    this.simulationTimer.unref?.()
  }

  private async simulateTick(): Promise<void> {
    if (this.simulationRunning) return
    this.simulationRunning = true

    try {
      const now = Date.now()
      const staleAfterMs = Math.max(env.marketData.pollIntervalMs * 3, 30_000)
      const markets = await this.prisma.market.findMany({
        where: { provider: env.marketData.provider, asset: { isActive: true } },
        include: { asset: true },
      })

      for (const market of markets) {
        const stale = !market.lastPriceAt || now - market.lastPriceAt.getTime() > staleAfterMs
        // A live provider that is delivering fresh prices owns the market.
        if (this.provider && !this.simulatedAssets.has(market.assetId) && !stale) continue

        const symbol = market.asset.symbol
        let anchor = this.simulationAnchors.get(symbol)
        if (anchor === undefined) {
          const stored = market.lastPrice ? Number(market.lastPrice.toString()) : 0
          anchor = stored > 0 ? stored : Number(DEMO_PRICE_BASES[symbol] ?? '100')
          this.simulationAnchors.set(symbol, anchor)
        }

        const price = this.simulator.quote(symbol, anchor)
        const digits = price < 10 ? 6 : 2
        const last = price.toFixed(digits)
        const changePct = (((price - anchor) / anchor) * 100).toFixed(4)
        const timestamp = new Date(now)

        await this.prisma.market.update({
          where: { id: market.id },
          data: { status: 'OPEN', lastPrice: last, lastPriceAt: timestamp, lastChangePct: changePct },
        })
        this.simulatedAssets.add(market.assetId)

        await this.publishEvent(createRealtimeEvent('market.price', {
          assetId: market.assetId,
          symbol,
          bid: last,
          ask: last,
          last,
          changePct,
          volume: null,
          timestamp: timestamp.toISOString(),
        }, ('market:' + market.assetId) as `market:${string}`))
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Simulated market price update failed')
    } finally {
      this.simulationRunning = false
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
      this.simulatedAssets.delete(market.assetId)

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
          lastChangePct: quote.changePct,
          lastVolume: quote.volume,
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

      try {
        const candles = await this.provider!.candles(definition, '5min', 1)
        const candle = candles.at(-1)
        if (candle) {
          await this.publishEvent(createRealtimeEvent('market.candle', {
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
          }, channel))
        }
      } catch (error) {
        this.logger.warn(
          { err: error, assetId: market.assetId, symbol: market.asset.symbol },
          'Market candle realtime update failed',
        )
      }
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
    try {
      await publishRealtime(serializeRealtimeEvent(event))
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to publish market realtime event')
    }
  }
}


export { CANDLE_INTERVALS }
