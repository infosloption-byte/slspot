import type { MarketDataProvider } from './provider.js'
import { intervalMs } from './intervals.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

type FetchLike = typeof fetch

const INTERVALS: Record<CandleInterval, string | undefined> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '45min': undefined,
  '1h': '1H',
  '2h': '2H',
  '4h': '4H',
  '8h': '8H',
  '1day': '1D',
  '1week': '1W',
  '1month': '1M',
}

export function toOkxInstrument(externalSymbol: string): string {
  const [base, quote = 'USD'] = externalSymbol.toUpperCase().split('/')
  return base + '-' + (quote === 'USD' ? 'USDT' : quote)
}

export type OkxProviderOptions = {
  baseUrl?: string
  requestTimeoutMs?: number
  fetcher?: FetchLike
}

export class OkxProvider implements MarketDataProvider {
  readonly name = 'okx'
  readonly assetType = 'CRYPTO' as const
  private readonly baseUrl: string
  private readonly requestTimeoutMs: number
  private readonly fetcher: FetchLike

  constructor(options: OkxProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.okx.com').replace(/\/$/, '')
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.fetcher = options.fetcher ?? fetch
  }

  supports(market: MarketDefinition): boolean {
    return market.assetType === 'CRYPTO'
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    const data = await this.request<{ code?: string; msg?: string; data?: Array<{ last?: string; bidPx?: string; askPx?: string; vol24h?: string; ts?: string; open24h?: string }> }>(
      '/api/v5/market/ticker',
      { instId: toOkxInstrument(market.externalSymbol) },
    )
    const ticker = data.data?.[0]
    const last = ticker?.last
    if (!last) throw new Error('OKX ticker did not contain a last price')
    const open24h = Number(ticker.open24h)
    const lastNumber = Number(last)
    const changePct = Number.isFinite(open24h) && open24h > 0 && Number.isFinite(lastNumber)
      ? (((lastNumber - open24h) / open24h) * 100).toFixed(4)
      : '0'
    return {
      provider: this.name,
      externalSymbol: market.externalSymbol,
      last,
      bid: ticker.bidPx ?? last,
      ask: ticker.askPx ?? last,
      changePct,
      volume: ticker.vol24h ?? null,
      timestamp: new Date(Number(ticker.ts ?? Date.now())).toISOString(),
      status: 'OPEN',
    }
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    const bar = INTERVALS[interval]
    if (!bar) throw new Error('OKX does not support the ' + interval + ' interval')
    const data = await this.request<{ code?: string; msg?: string; data?: string[][] }>(
      '/api/v5/market/candles',
      {
        instId: toOkxInstrument(market.externalSymbol),
        bar,
        limit: String(Math.min(1440, Math.max(1, limit))),
      },
    )
    const step = intervalMs(interval)
    return (data.data ?? []).slice().reverse().map((row) => {
      const openTime = Number(row[0])
      return {
        interval,
        openTime: new Date(openTime).toISOString(),
        closeTime: new Date(openTime + step).toISOString(),
        open: String(row[1]),
        high: String(row[2]),
        low: String(row[3]),
        close: String(row[4]),
        volume: String(row[6] ?? row[5] ?? '0'),
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
      const body = await response.json() as T & { code?: string; msg?: string }
      if (!response.ok) throw new Error('OKX HTTP ' + response.status)
      if (body.code && body.code !== '0') throw new Error('OKX ' + (body.msg ?? body.code))
      return body
    } finally {
      clearTimeout(timeout)
    }
  }
}
