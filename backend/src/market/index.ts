import { env } from '../config/env.js'
import type { MarketDataProvider } from './provider.js'
import { BinanceProvider } from './binance.js'

export function createMarketDataProvider(): MarketDataProvider | null {
  if (!env.marketData.enabled || env.marketData.provider === 'disabled') return null
  if (!env.marketData.binance.enabled) return null

  return new BinanceProvider({
    baseUrl: env.marketData.binance.restUrl,
    requestTimeoutMs: env.marketData.requestTimeoutMs,
  })
}
