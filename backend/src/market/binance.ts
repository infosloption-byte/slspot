import type { MarketDataProvider, ProviderCandleOptions } from './provider.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

type FetchLike = typeof fetch

export type BinanceProviderOptions = { baseUrl?: string; fallbackUrls?: string[]; requestTimeoutMs?: number; fetcher?: FetchLike }

const INTERVALS: Record<CandleInterval, { binance: string; ms: number } | undefined> = {
  '1min': { binance: '1m', ms: 60_000 },
  '5min': { binance: '5m', ms: 300_000 },
  '15min': { binance: '15m', ms: 900_000 },
  '30min': { binance: '30m', ms: 1_800_000 },
  '45min': undefined,
  '1h': { binance: '1h', ms: 3_600_000 },
  '2h': { binance: '2h', ms: 7_200_000 },
  '4h': { binance: '4h', ms: 14_400_000 },
  '8h': { binance: '8h', ms: 28_800_000 },
  '1day': { binance: '1d', ms: 86_400_000 },
  '1week': { binance: '1w', ms: 604_800_000 },
  '1month': { binance: '1M', ms: 2_592_000_000 },
}

/** "BTC/USD" -> "BTCUSDT" (USD is quoted as USDT on Binance). */
export function toBinanceSymbol(externalSymbol: string): string {
  const [base, quote = 'USD'] = externalSymbol.toUpperCase().split('/')
  return base + (quote === 'USD' ? 'USDT' : quote)
}

export const DEFAULT_FALLBACK_URLS = ['https://data-api.binance.vision', 'https://api1.binance.com', 'https://api2.binance.com']

// Bound logical requests so candle-close bursts do not open hundreds of sockets.
const MAX_CONCURRENT_REQUESTS = 6
const HOSTS_PER_ATTEMPT = 2

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance'
  readonly assetType = 'CRYPTO' as const

  supports(market: MarketDefinition): boolean {
    return market.assetType === 'CRYPTO'
  }
  private readonly baseUrls: string[]
  private readonly requestTimeoutMs: number
  private readonly fetcher: FetchLike
  private activeRequests = 0
  private readonly requestWaiters: Array<() => void> = []

  constructor(options: BinanceProviderOptions = {}) {
    // Several public hosts: some networks block or throttle api.binance.com while the
    // market-data-only mirror still answers. Requests race and the first good answer wins.
    this.baseUrls = [...new Set([
      options.baseUrl ?? 'https://api.binance.com',
      ...(options.fallbackUrls ?? DEFAULT_FALLBACK_URLS),
    ].map((url) => url.replace(/\/$/, '')))]
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.fetcher = options.fetcher ?? fetch
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    const data = await this.request<{ lastPrice?: string; bidPrice?: string; askPrice?: string; priceChangePercent?: string; volume?: string; closeTime?: number }>(
      '/api/v3/ticker/24hr',
      { symbol: toBinanceSymbol(market.externalSymbol) },
    )
    if (!data.lastPrice) throw new Error('Binance ticker did not contain a last price')
    return {
      provider: this.name,
      externalSymbol: market.externalSymbol,
      last: data.lastPrice,
      bid: data.bidPrice ?? data.lastPrice,
      ask: data.askPrice ?? data.lastPrice,
      changePct: data.priceChangePercent ?? '0',
      volume: data.volume ?? null,
      timestamp: new Date(data.closeTime ?? Date.now()).toISOString(),
      status: 'OPEN',
    }
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number, options: ProviderCandleOptions = {}): Promise<ProviderCandle[]> {
    const spec = INTERVALS[interval]
    if (!spec) throw new Error('Binance does not support the ' + interval + ' interval')
    const params: Record<string, string> = {
      symbol: toBinanceSymbol(market.externalSymbol),
      interval: spec.binance,
      limit: String(Math.min(1000, Math.max(1, limit))),
    }
    if (options.endTimeMs !== undefined) {
      if (!Number.isSafeInteger(options.endTimeMs) || options.endTimeMs < 0) throw new Error('Invalid candle end time')
      params.endTime = String(options.endTimeMs)
    }
    const rows = await this.request<Array<Array<string | number>>>('/api/v3/klines', params)
    return rows.map((row) => ({
      interval,
      openTime: new Date(Number(row[0])).toISOString(),
      closeTime: new Date(Number(row[0]) + spec.ms).toISOString(),
      open: String(row[1]),
      high: String(row[2]),
      low: String(row[3]),
      close: String(row[4]),
      volume: String(row[5]),
    }))
  }

  private async acquireRequestSlot(): Promise<void> {
    if (this.activeRequests < MAX_CONCURRENT_REQUESTS) {
      this.activeRequests += 1
      return
    }
    await new Promise<void>((resolve) => this.requestWaiters.push(resolve))
  }

  private releaseRequestSlot(): void {
    const next = this.requestWaiters.shift()
    if (next) next()
    else this.activeRequests -= 1
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.acquireRequestSlot()
    const reasons: string[] = []
    try {
      // Probe two hosts at a time: one primary and one fallback. A broad fan-out
      // against every host for every candle can overload the local connection pool.
      for (let offset = 0; offset < this.baseUrls.length; offset += HOSTS_PER_ATTEMPT) {
        const hosts = this.baseUrls.slice(offset, offset + HOSTS_PER_ATTEMPT)
        const controllers = hosts.map(() => new AbortController())
        const attempts = hosts.map(async (baseUrl, index) => {
          const url = new URL(baseUrl + path)
          Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
          const controller = controllers[index]!
          const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
          timeout.unref?.()
          try {
            const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
            if (!response.ok) throw new Error('Binance HTTP ' + response.status + ' from ' + url.host)
            return await response.json() as T
          } finally {
            clearTimeout(timeout)
          }
        })

        try {
          return await Promise.any(attempts)
        } catch (error) {
          if (error instanceof AggregateError) {
            reasons.push(...error.errors.map((reason) => String(reason instanceof Error ? reason.message : reason)))
          } else {
            reasons.push(String(error instanceof Error ? error.message : error))
          }
        } finally {
          controllers.forEach((controller) => controller.abort())
        }
      }
      throw new Error('Binance request failed on every endpoint: ' + reasons.join('; '))
    } finally {
      this.releaseRequestSlot()
    }
  }
}
