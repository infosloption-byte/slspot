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
    return this.run(market, (provider) => provider.quote(market))
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    return this.run(market, (provider) => provider.candles(market, interval, limit))
  }

  /** Crypto tries the exchange feed first and falls back to the general provider if it fails. */
  private async run<T>(market: MarketDefinition, call: (provider: MarketDataProvider) => Promise<T>): Promise<T> {
    const chain = (market.assetType === 'CRYPTO' ? [this.crypto, this.general] : [this.general])
      .filter((provider): provider is MarketDataProvider => provider !== null)
    if (chain.length === 0) throw new Error('No market data provider is configured for ' + market.assetType)
    let lastError: unknown
    for (const provider of chain) {
      try {
        return await call(provider)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}
