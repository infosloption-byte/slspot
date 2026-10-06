import { env } from '../config/env.js'
import type { MarketDataProvider } from './provider.js'
import { BinanceProvider } from './binance.js'
import { CompositeProvider } from './composite.js'
import { KrakenProvider } from './kraken.js'
import { OkxProvider } from './okx.js'

export function createMarketDataProvider(): MarketDataProvider | null {
  if (!env.marketData.enabled || env.marketData.provider === 'disabled') return null

  const providers: MarketDataProvider[] = []
  if (env.marketData.binance.enabled) {
    providers.push(new BinanceProvider({
      baseUrl: env.marketData.binance.restUrl,
      requestTimeoutMs: env.marketData.requestTimeoutMs,
    }))
  }
  if (env.marketData.kraken.enabled) {
    providers.push(new KrakenProvider({
      baseUrl: env.marketData.kraken.baseUrl,
      requestTimeoutMs: env.marketData.requestTimeoutMs,
    }))
  }
  if (env.marketData.okx.enabled) {
    providers.push(new OkxProvider({
      baseUrl: env.marketData.okx.baseUrl,
      requestTimeoutMs: env.marketData.requestTimeoutMs,
    }))
  }

  return providers.length > 0 ? new CompositeProvider(providers) : null
}
