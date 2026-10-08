import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

export type MarketAssetType = 'CRYPTO' | 'FOREX' | 'STOCK' | 'COMMODITY' | 'INDEX' | 'OTHER'

export type MarketAsset = {
  assetId: string
  symbol: string
  name: string
  type: MarketAssetType
  baseCurrency: string | null
  quoteCurrency: string | null
  priceScale: number
  quantityScale: number
  trading: {
    enabled: boolean
    payoutRate: string
    minAmount: string
    maxAmount: string
    durationsSeconds: number[]
    feeRate: string
  }
  market: {
    id: string
    status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE'
    provider: string
    externalSymbol: string
    lastPrice: string | null
    lastPriceAt: string | null
    lastChangePct: string | null
    lastVolume: string | null
    lastPriceProvider: string | null
  } | null
}

export type MarketAssetsQuery = {
  page?: number
  pageSize?: number
  type?: MarketAssetType
}

export type MarketCandleResponse = {
  assetId: string
  symbol: string
  interval: string
  candles: Array<{
    assetId: string
    symbol: string
    interval: string
    openTime: string
    closeTime: string
    open: string
    high: string
    low: string
    close: string
    volume: string
  }>
}

export const marketApi = {
  listAssets: (query: MarketAssetsQuery = {}) =>
    apiClient
      .get<ApiSuccess<PaginatedData<MarketAsset>>>('/market/assets' + toQueryString(query))
      .then((response) => response.data),

  candles: (assetId: string, query: { interval?: string; limit?: number; endTime?: number } = {}) =>
    apiClient
      .get<ApiSuccess<MarketCandleResponse>>('/market/assets/' + encodeURIComponent(assetId) + '/candles' + toQueryString(query))
      .then((response) => response.data),
}

function toQueryString(query: MarketAssetsQuery & { interval?: string; limit?: number }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.type) params.set('type', query.type)
  if (query.interval) params.set('interval', query.interval)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.endTime !== undefined) params.set('endTime', String(query.endTime))
  const value = params.toString()
  return value ? '?' + value : ''
}
