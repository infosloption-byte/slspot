import type { MarketDataProvider } from './provider.js'
import type { CandleInterval, MarketDefinition, ProviderCandle, ProviderQuote } from './types.js'

/**
 * Ordered market-source failover. Only one provider is selected for a request:
 * Binance first, then Kraken, then OKX. Providers must explicitly support the asset.
 */
export class CompositeProvider implements MarketDataProvider {
  readonly name: string
  readonly assetType = 'CRYPTO' as const

  constructor(private readonly providers: MarketDataProvider[]) {
    this.name = providers.map((provider) => provider.name).join('+') || 'none'
  }

  supports(market: MarketDefinition): boolean {
    return this.providers.some((provider) => provider.supports(market))
  }

  async quote(market: MarketDefinition): Promise<ProviderQuote> {
    return this.run(market, (provider) => provider.quote(market))
  }

  async candles(market: MarketDefinition, interval: CandleInterval, limit: number): Promise<ProviderCandle[]> {
    return this.run(market, (provider) => provider.candles(market, interval, limit))
  }

  private async run<T>(market: MarketDefinition, call: (provider: MarketDataProvider) => Promise<T>): Promise<T> {
    const chain = this.providers.filter((provider) => provider.supports(market))
    if (chain.length === 0) throw new Error('No market data provider supports ' + market.symbol)

    let lastError: unknown
    for (const provider of chain) {
      try {
        return await call(provider)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All market providers failed')
  }
}
