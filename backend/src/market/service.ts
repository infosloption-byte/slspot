import type { AssetType, PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { publishRealtime } from '../realtime/bus.js'
import type { MarketDataProvider } from './provider.js'
import { CANDLE_INTERVALS, isCandleInterval, type CandleInterval, type MarketDefinition } from './types.js'
import { ensureDefaultMarketRegistry } from './registry.js'
import { DEMO_PRICE_BASES, DemoPriceSimulator } from '../trading/demoPrice.js'
import { BinanceTickStream, type Tick } from './binance-stream.js'
import { KrakenTickStream, type KrakenTick } from './kraken-stream.js'
import { OkxTickStream, type OkxTick } from './okx-stream.js'
import { getLivePrice, getPreferredLivePrice, setLivePrice } from './live-prices.js'
import { syntheticCandles } from './synthetic.js'

const SIMULATION_INTERVAL_MS = 1_000
const TICK_PUBLISH_INTERVAL_MS = 100
const TICK_PERSIST_INTERVAL_MS = 2_000
/** A live tick younger than this means the stream owns the price. */
const TICK_FRESH_MS = 10_000

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
  private readonly tickStreams: Array<{ stop: () => void }> = []
  private readonly activeProviders = new Map<string, string>()
  private readonly tickMarkets = new Map<string, { id: string; assetId: string; symbol: string }>()
  private readonly tickState = new Map<string, { published: number; persisted: number; first: boolean }>()
  private readonly changePct = new Map<string, string>()

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
      await ensureDefaultMarketRegistry(this.prisma)
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
    await this.startTickStreams()
    await this.poll()
  }

  /** Keep all crypto exchange streams warm; the freshest preferred source wins per asset. */
  private async startTickStreams(): Promise<void> {
    if (typeof WebSocket === 'undefined') return
    try {
      const markets = await this.prisma.market.findMany({
        where: { asset: { isActive: true, type: 'CRYPTO' } },
        include: { asset: true },
      })
      this.tickMarkets.clear()
      for (const market of markets) {
        this.tickMarkets.set(market.externalSymbol, { id: market.id, assetId: market.assetId, symbol: market.asset.symbol })
      }
      const symbols = [...this.tickMarkets.keys()]
      if (symbols.length === 0) return

      if (env.marketData.binance.enabled) {
        const stream = new BinanceTickStream({
          url: env.marketData.binance.wsUrl,
          logger: this.logger,
          onTick: (tick) => void this.handleTick(tick),
        })
        stream.start(symbols)
        this.tickStreams.push(stream)
      }
      if (env.marketData.kraken.enabled) {
        const stream = new KrakenTickStream({
          url: env.marketData.kraken.wsUrl,
          logger: this.logger,
          onTick: (tick) => void this.handleTick(tick),
        })
        stream.start(symbols)
        this.tickStreams.push(stream)
      }
      if (env.marketData.okx.enabled) {
        const stream = new OkxTickStream({
          url: env.marketData.okx.wsUrl,
          logger: this.logger,
          onTick: (tick) => void this.handleTick(tick),
        })
        stream.start(symbols)
        this.tickStreams.push(stream)
      }

      this.logger.info({ symbols: symbols.length, providers: ['binance', 'kraken', 'okx'].filter((provider) => {
        if (provider === 'binance') return env.marketData.binance.enabled
        if (provider === 'kraken') return env.marketData.kraken.enabled
        return env.marketData.okx.enabled
      }) }, 'Crypto market tick streams started')
    } catch (error) {
      this.logger.warn({ err: error }, 'Crypto market tick streams could not be started')
    }
  }

  async handleTick(tick: Tick | KrakenTick | OkxTick): Promise<void> {
    const market = this.tickMarkets.get(tick.externalSymbol)
    if (!market) return

    setLivePrice(market.assetId, tick.provider, tick.price, tick.at, tick.sequence, Date.now())
    this.simulatedAssets.delete(market.assetId)

    const preferred = getPreferredLivePrice(
      market.assetId,
      TICK_FRESH_MS,
      ['binance', 'kraken', 'okx'],
    )
    if (!preferred) return

    const previousProvider = this.activeProviders.get(market.assetId)
    if (previousProvider !== preferred.provider) {
      this.activeProviders.set(market.assetId, preferred.provider)
      await this.prisma.market.update({
        where: { id: market.id },
        data: {
          provider: preferred.provider,
          status: 'OPEN',
          lastPrice: preferred.price,
          lastPriceAt: new Date(preferred.at),
          lastPriceProvider: preferred.provider,
        },
      }).catch((error: unknown) => this.logger.warn({ err: error, assetId: market.assetId, provider: preferred.provider }, 'Failed to persist active market source'))
    }

    if (tick.provider !== preferred.provider) return

    const state = this.tickState.get(market.assetId) ?? { published: 0, persisted: 0, first: true }
    this.tickState.set(market.assetId, state)
    const receivedAt = Date.now()

    if (receivedAt - state.published >= TICK_PUBLISH_INTERVAL_MS) {
      state.published = receivedAt
      await this.publishEvent(createRealtimeEvent('market.price', {
        assetId: market.assetId,
        symbol: market.symbol,
        bid: tick.price,
        ask: tick.price,
        last: tick.price,
        changePct: this.changePct.get(market.assetId) ?? '0',
        volume: null,
        provider: tick.provider,
        sequence: tick.sequence,
        timestamp: new Date(tick.at).toISOString(),
      }, ('market:' + market.assetId) as `market:${string}`))
    }

    if (state.first || receivedAt - state.persisted >= TICK_PERSIST_INTERVAL_MS) {
      state.first = false
      state.persisted = receivedAt
      await this.prisma.market.update({
        where: { id: market.id },
        data: {
          provider: tick.provider,
          status: 'OPEN',
          lastPrice: tick.price,
          lastPriceAt: new Date(tick.at),
          lastPriceProvider: tick.provider,
        },
      }).catch((error: unknown) => this.logger.warn({ err: error, assetId: market.assetId, provider: tick.provider }, 'Failed to persist live tick'))
    }
  }
  async stop(): Promise<void> {
    this.running = false
    this.tickStreams.splice(0).forEach((stream) => stream.stop())
    this.activeProviders.clear()
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
    if (!isCandleInterval(intervalValue) || (!this.provider && !env.marketData.simulate)) {
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
      if (!this.provider) throw new Error('No market data provider is configured')
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
        // Keep the chart usable in development: history that ends at the current price.
        const live = getPreferredLivePrice(market.assetId, 60_000, ['binance', 'kraken', 'okx'])
        const stored = market.lastPrice ? Number(market.lastPrice.toString()) : 0
        const anchor = live ? Number(live.price) : this.simulationAnchors.get(market.asset.symbol) ?? (stored > 0 ? stored : Number(DEMO_PRICE_BASES[market.asset.symbol] ?? '100'))
        candles = syntheticCandles(intervalValue as CandleInterval, Math.min(500, Math.max(1, limit)), anchor, Date.now(), market.asset.symbol)
      } else {
        throw new MarketDataUnavailableError('Market data provider request failed')
      }
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
        where: { asset: { isActive: true, type: 'CRYPTO' } },
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
          provider: 'demo-simulation',
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
        where: { asset: { isActive: true, type: 'CRYPTO' } },
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
    id: string
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
      this.changePct.set(market.assetId, quote.changePct)

      const channel = ('market:' + market.assetId) as `market:${string}`
      // While the tick stream is delivering, the REST quote (older by definition) must not
      // overwrite the price; it only refreshes the 24h change and volume.
      const streaming = getPreferredLivePrice(market.assetId, TICK_FRESH_MS, ['binance', 'kraken', 'okx']) !== null

      if (streaming) {
        await this.prisma.market.update({ where: { id: market.id }, data: { lastChangePct: quote.changePct, lastVolume: quote.volume } })
        return
      }

      await this.prisma.market.update({
        where,
        data: {
          provider: quote.provider,
          status: quote.status,
          lastPrice: quote.last,
          lastPriceAt: new Date(quote.timestamp),
          lastPriceProvider: quote.provider,
          lastChangePct: quote.changePct,
          lastVolume: quote.volume,
        },
      })

      await this.publishEvent(createRealtimeEvent('market.price', {
        assetId: market.assetId,
        symbol: market.asset.symbol,
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        changePct: quote.changePct,
        volume: quote.volume,
        provider: quote.provider,
        timestamp: quote.timestamp,
      }, channel))

      await this.publishEvent(createRealtimeEvent('market.status', {
        assetId: market.assetId,
        symbol: market.asset.symbol,
        status: quote.status.toLowerCase(),
        provider: quote.provider,
        timestamp: quote.timestamp,
      }, channel))
    } catch (error) {
      // A failing poll must not flag the market as down while ticks or the dev simulation are
      // still keeping it priced.
      const covered = env.marketData.simulate || getPreferredLivePrice(market.assetId, TICK_FRESH_MS, ['binance', 'kraken', 'okx']) !== null
      if (!covered) {
        await this.prisma.market.update({
          where: { id: market.id },
          data: { status: 'MAINTENANCE' },
        }).catch(() => undefined)

        await this.publishEvent(createRealtimeEvent('market.status', {
          assetId: market.assetId,
          symbol: market.asset.symbol,
          status: 'maintenance',
          timestamp: new Date().toISOString(),
        }, ('market:' + market.assetId) as `market:${string}`))
      }

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
