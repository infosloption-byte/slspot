import { env } from '../config/env.js'
import type { MarketDataProvider } from './provider.js'
import { BinanceProvider } from './binance.js'
import { CompositeProvider } from './composite.js'
import { TwelveDataProvider } from './twelve-data.js'

export function createMarketDataProvider(): MarketDataProvider | null {
  if (!env.marketData.enabled || env.marketData.provider === 'disabled') return null
  const crypto = env.marketData.binance.enabled
    ? new BinanceProvider({ baseUrl: env.marketData.binance.restUrl, requestTimeoutMs: env.marketData.requestTimeoutMs })
    : null
  const general = env.marketData.provider === 'twelve-data' && env.marketData.apiKey
    ? new TwelveDataProvider({ apiKey: env.marketData.apiKey, baseUrl: env.marketData.baseUrl, requestTimeoutMs: env.marketData.requestTimeoutMs })
    : null
  return crypto || general ? new CompositeProvider(crypto, general) : null
}
