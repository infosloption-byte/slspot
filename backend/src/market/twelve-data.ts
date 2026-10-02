import type { MarketDataProvider } from './provider.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

type FetchLike = typeof fetch

type TwelveQuote = {
  close?: string
  price?: string
  percent_change?: string
  volume?: string
  timestamp?: number
  last_quote_at?: number
  is_market_open?: boolean
  status?: string
  code?: number
  message?: string
}

type TwelveTimeSeries = {
  values?: Array<{
    datetime?: string
    timestamp?: number
    open?: string
    high?: string
    low?: string
    close?: string
    volume?: string
  }>
  status?: string
  code?: number
  message?: string
}

export type TwelveDataProviderOptions = {
  apiKey: string
  baseUrl?: string
  requestTimeoutMs?: number
  fetcher?: FetchLike
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'twelve-data'
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly requestTimeoutMs: number
  private readonly fetcher: FetchLike

  constructor(options: TwelveDataProviderOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://api.twelvedata.com').replace(/\/$/, '')
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.fetcher = options.fetcher ?? fetch
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    const data = await this.request<TwelveQuote>('/quote', { symbol: market.externalSymbol })
    const last = data.close ?? data.price
    if (!last) throw new Error('Twelve Data quote did not contain a close price')
    const timestampSeconds = data.last_quote_at ?? data.timestamp ?? Math.floor(Date.now() / 1000)

    return {
      externalSymbol: market.externalSymbol,
      last,
      bid: last,
      ask: last,
      changePct: data.percent_change ?? '0',
      volume: data.volume ?? null,
      timestamp: new Date(timestampSeconds * 1000).toISOString(),
      status: data.is_market_open === false ? 'CLOSED' : 'OPEN',
    }
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    const data = await this.request<TwelveTimeSeries>('/time_series', {
      symbol: market.externalSymbol,
      interval,
      outputsize: String(limit),
      timezone: 'UTC',
      order: 'asc',
    })

    return (data.values ?? [])
      .filter((value) => Boolean(value.open && value.high && value.low && value.close))
      .map((value) => {
        const openTimestamp = this.parseTimestamp(value.timestamp, value.datetime)
        return {
          interval,
          openTime: new Date(openTimestamp).toISOString(),
          closeTime: new Date(openTimestamp + intervalMs(interval)).toISOString(),
          open: value.open as string,
          high: value.high as string,
          low: value.low as string,
          close: value.close as string,
          volume: value.volume ?? '0',
        }
      })
  }

  private async request<T>(path: string, params: Record<string,string>): Promise<T> {
    const url = new URL(this.baseUrl + path)
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    timeout.unref?.()
    try {
      const response = await this.fetcher(url, {
        headers: { Accept: 'application/json', Authorization: 'apikey ' + this.apiKey },
        signal: controller.signal,
      })
      const body = await response.json() as T & { status?: string; code?: number; message?: string }
      if (!response.ok) throw new Error('Twelve Data HTTP ' + response.status)
      if (body.status === 'error' || body.code) throw new Error(body.message ?? 'Twelve Data request failed')
      return body
    } finally {
      clearTimeout(timeout)
    }
  }

  private parseTimestamp(timestamp: number | undefined, datetime: string | undefined): number {
    if (timestamp !== undefined && Number.isFinite(timestamp)) return timestamp * 1000
    if (!datetime) return Date.now()
    const normalized = datetime.includes('T') ? datetime : datetime.replace(' ', 'T')
    const parsed = Date.parse(normalized.endsWith('Z') ? normalized : normalized + 'Z')
    return Number.isFinite(parsed) ? parsed : Date.now()
  }
}

function intervalMs(interval: CandleInterval): number {
  switch (interval) {
    case '1min': return 60_000
    case '5min': return 300_000
    case '15min': return 900_000
    case '30min': return 1_800_000
    case '45min': return 2_700_000
    case '1h': return 3_600_000
    case '2h': return 7_200_000
    case '4h': return 14_400_000
    case '8h': return 28_800_000
    case '1day': return 86_400_000
    case '1week': return 604_800_000
    case '1month': return 2_592_000_000
  }
}
