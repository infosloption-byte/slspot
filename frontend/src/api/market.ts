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
  market: {
    id: string
    status: 'OPEN' | 'CLOSED' | 'HALTED' | 'MAINTENANCE'
    provider: string
    externalSymbol: string
    lastPrice: string | null
    lastPriceAt: string | null
  } | null
}

export type MarketAssetsQuery = {
  page?: number
  pageSize?: number
  type?: MarketAssetType
}

export const marketApi = {
  listAssets: (query: MarketAssetsQuery = {}) =>
    apiClient
      .get<ApiSuccess<PaginatedData<MarketAsset>>>('/market/assets' + toQueryString(query))
      .then((response) => response.data),
}

function toQueryString(query: MarketAssetsQuery): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.type) params.set('type', query.type)
  const value = params.toString()
  return value ? '?' + value : ''
}
