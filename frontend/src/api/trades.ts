import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

export type TradeRecord = {
  id: string
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'
  grossPnl: string | null
  fee: string
  netPnl: string | null
  openedAt: string
  closedAt: string | null
  position: {
    id: string
    side: 'BUY' | 'SELL'
    amount: string
    entryPrice: string
    exitPrice: string | null
    asset: {
      id: string
      symbol: string
      name: string
    }
  }
}

export const tradesApi = {
  list: (query: { page?: number; pageSize?: number; status?: TradeRecord['status'] } = {}) =>
    apiClient
      .get<ApiSuccess<PaginatedData<TradeRecord>>>('/trades' + toQueryString(query))
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number; status?: string }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.status) params.set('status', query.status)
  const value = params.toString()
  return value ? '?' + value : ''
}
