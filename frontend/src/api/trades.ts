import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

function data<T>(response: ApiSuccess<T>): T {
  return response.data
}

export type TradeRecord = {
  id: string
  orderId: string
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'EXPIRED'
  direction: 'UP' | 'DOWN'
  amount: string
  payoutRate: string
  durationSeconds: number
  expiresAt: string | null
  grossPnl: string | null
  fee: string
  netPnl: string | null
  settlementReference: string | null
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
      .then(data),

  create: (input: {
    assetId: string
    direction: 'UP' | 'DOWN'
    amount: string
    durationSeconds: number
    clientRequestId: string
  }) =>
    apiClient
      .post<ApiSuccess<{
        orderId: string
        tradeId: string
        positionId: string
        status: string
        direction: 'UP' | 'DOWN'
        amount: string
        entryPrice: string
        exitPrice: string | null
        payoutRate: string
        fee: string
        grossPnl: string | null
        netPnl: string | null
        openedAt: string
        closedAt: string | null
        expiresAt: string | null
        settlementId: string | null
        settlementPrice: string | null
        settlementReference: string | null
      }>>('/trades', input, { idempotencyKey: input.clientRequestId })
      .then(data),

  close: (tradeId: string) =>
    apiClient
      .post<ApiSuccess<{
        tradeId: string
        status: string
        grossPnl: string | null
        netPnl: string | null
        settlementId: string | null
        settlementPrice: string | null
      }>>('/trades/' + encodeURIComponent(tradeId) + '/close')
      .then(data),
}

function toQueryString(query: { page?: number; pageSize?: number; status?: string }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.status) params.set('status', query.status)
  const value = params.toString()
  return value ? '?' + value : ''
}
