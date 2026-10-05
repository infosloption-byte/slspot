import type { MarketDataProvider } from './provider.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

/** Routes crypto to a dedicated exchange feed and everything else to the general provider. */
export class CompositeProvider implements MarketDataProvider {
  readonly name: string

  constructor(
    private readonly crypto: MarketDataProvider | null,
    private readonly general: MarketDataProvider | null,
  ) {
    this.name = [crypto?.name, general?.name].filter(Boolean).join('+') || 'none'
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    return this.pick(market).quote(market)
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    return this.pick(market).candles(market, interval, limit)
  }

  private pick(market: MarketDefinition): MarketDataProvider {
    const provider = market.assetType === 'CRYPTO' ? (this.crypto ?? this.general) : this.general
    if (!provider) throw new Error('No market data provider is configured for ' + market.assetType)
    return provider
  }
}
