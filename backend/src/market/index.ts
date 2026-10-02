import { env } from '../config/env.js'
import type { MarketDataProvider } from './provider.js'
import { TwelveDataProvider } from './twelve-data.js'

export function createMarketDataProvider(): MarketDataProvider | null {
  if (!env.marketData.enabled || env.marketData.provider === 'disabled') return null
  if (env.marketData.provider === 'twelve-data' && env.marketData.apiKey) {
    return new TwelveDataProvider({ apiKey:env.marketData.apiKey,baseUrl:env.marketData.baseUrl,requestTimeoutMs:env.marketData.requestTimeoutMs })
  }
  return null
}
