import type { MarketDataProvider } from './provider.js'
import { intervalMs } from './intervals.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

type FetchLike = typeof fetch

export type KrakenProviderOptions = {
  baseUrl?: string
  requestTimeoutMs?: number
  fetcher?: FetchLike
}

const INTERVALS: Record<CandleInterval, number | undefined> = {
  '1min': 1,
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '45min': undefined,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '8h': 480,
  '1day': 1440,
  '1week': 10080,
  '1month': undefined,
}

export function toKrakenPair(externalSymbol: string): string {
  const [base, quote = 'USD'] = externalSymbol.toUpperCase().split('/')
  const normalizedBase = base === 'BTC' ? 'XBT' : base
  const normalizedQuote = quote === 'USD' ? 'USDT' : quote
  return normalizedBase + normalizedQuote
}

type KrakenTicker = {
  a?: string[]
  b?: string[]
  c?: string[]
  p?: string[]
  v?: string[]
}

export class KrakenProvider implements MarketDataProvider {
  readonly name = 'kraken'
  readonly assetType = 'CRYPTO' as const
  private readonly baseUrl: string
  private readonly requestTimeoutMs: number
  private readonly fetcher: FetchLike

  constructor(options: KrakenProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.kraken.com').replace(/\/$/, '')
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.fetcher = options.fetcher ?? fetch
  }

  supports(market: MarketDefinition): boolean {
    return market.assetType === 'CRYPTO'
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    const data = await this.request<{ error?: string[]; result?: Record<string, KrakenTicker> }>('/0/public/Ticker', { pair: toKrakenPair(market.externalSymbol) })
    const ticker = Object.values(data.result ?? {})[0]
    const last = ticker?.c?.[0]
    if (!last) throw new Error('Kraken ticker did not contain a last price')
    const timestamp = new Date().toISOString()
    const previous = ticker.p?.[1]
    const changePct = previous && Number(previous) > 0
      ? (((Number(last) - Number(previous)) / Number(previous)) * 100).toFixed(4)
      : '0'
    return {
      provider: this.name,
      externalSymbol: market.externalSymbol,
      last,
      bid: ticker.b?.[0] ?? last,
      ask: ticker.a?.[0] ?? last,
      changePct,
      volume: ticker.v?.[1] ?? ticker.v?.[0] ?? null,
      timestamp,
      status: 'OPEN',
    }
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    const minutes = INTERVALS[interval]
    if (!minutes) throw new Error('Kraken does not support the ' + interval + ' interval')
    const data = await this.request<{ error?: string[]; result?: Record<string, Array<Array<string | number>>> }>('/0/public/OHLC', {
      pair: toKrakenPair(market.externalSymbol),
      interval: String(minutes),
    })
    const rows = Object.entries(data.result ?? {}).find(([key]) => key !== 'last')?.[1] ?? []
    const step = intervalMs(interval)
    return rows.slice(-Math.min(720, Math.max(1, limit))).map((row) => {
      const openTime = Number(row[0]) * 1000
      return {
        interval,
        openTime: new Date(openTime).toISOString(),
        closeTime: new Date(openTime + step).toISOString(),
        open: String(row[1]),
        high: String(row[2]),
        low: String(row[3]),
        close: String(row[4]),
        volume: String(row[6] ?? '0'),
      }
    })
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    timeout.unref?.()
    try {
      const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      const body = await response.json() as T & { error?: string[] }
      if (!response.ok) throw new Error('Kraken HTTP ' + response.status)
      if (body.error?.length) throw new Error('Kraken ' + body.error.join(', '))
      return body
    } finally {
      clearTimeout(timeout)
    }
  }
}
