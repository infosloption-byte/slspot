import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

export type PortfolioSummary = {
  currency: string | null
  availableBalance: string
  heldBalance: string
  totalBalance: string
  openPositionCount: number
  tradeCount: number
  netPnl: string
}

export type PortfolioPosition = {
  id: string
  tradeId: string | null
  orderId: string
  status: 'OPEN' | 'CLOSED'
  side: 'BUY' | 'SELL'
  direction: 'UP' | 'DOWN'
  amount: string
  entryPrice: string
  currentPrice: string | null
  exitPrice: string | null
  payoutRate: string
  fee: string
  durationSeconds: number
  expiresAt: string | null
  openedAt: string
  closedAt: string | null
  asset: {
    id: string
    symbol: string
    name: string
  }
}

export const portfolioApi = {
  summary: () =>
    apiClient
      .get<ApiSuccess<PortfolioSummary>>('/portfolio/summary')
      .then((response) => response.data),

  positions: (query: { page?: number; pageSize?: number } = {}) =>
    apiClient
      .get<ApiSuccess<PaginatedData<PortfolioPosition>>>('/portfolio/positions' + toQueryString(query))
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const value = params.toString()
  return value ? '?' + value : ''
}
