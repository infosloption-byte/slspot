import type { MarketDataProvider } from './provider.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

type FetchLike = typeof fetch

export type BinanceProviderOptions = { baseUrl?: string; requestTimeoutMs?: number; fetcher?: FetchLike }

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

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance'
  private readonly baseUrl: string
  private readonly requestTimeoutMs: number
  private readonly fetcher: FetchLike

  constructor(options: BinanceProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.binance.com').replace(/\/$/, '')
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

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    const spec = INTERVALS[interval]
    if (!spec) throw new Error('Binance does not support the ' + interval + ' interval')
    const rows = await this.request<Array<Array<string | number>>>('/api/v3/klines', {
      symbol: toBinanceSymbol(market.externalSymbol),
      interval: spec.binance,
      limit: String(Math.min(1000, Math.max(1, limit))),
    })
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

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    timeout.unref?.()
    try {
      const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      if (!response.ok) throw new Error('Binance HTTP ' + response.status)
      return await response.json() as T
    } finally {
      clearTimeout(timeout)
    }
  }
}
