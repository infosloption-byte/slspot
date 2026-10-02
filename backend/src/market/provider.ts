import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

export interface MarketDataProvider {
  readonly name: string
  quote(market: MarketDefinition): Promise<ProviderQuote>
  candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]>
}
