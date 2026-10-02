import type { AssetType, MarketStatus } from '../generated/prisma/client.js'

export type MarketDefinition = {
  assetId: string
  assetType: AssetType
  symbol: string
  provider: string
  externalSymbol: string
}

export type ProviderQuote = {
  externalSymbol: string
  last: string
  bid: string
  ask: string
  changePct: string
  volume: string | null
  timestamp: string
  status: MarketStatus
}

export type ProviderCandle = {
  interval: string
  openTime: string
  closeTime: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export const CANDLE_INTERVALS = ['1min','5min','15min','30min','45min','1h','2h','4h','8h','1day','1week','1month'] as const
export type CandleInterval = (typeof CANDLE_INTERVALS)[number]
export function isCandleInterval(value: string): value is CandleInterval {
  return CANDLE_INTERVALS.includes(value as CandleInterval)
}
