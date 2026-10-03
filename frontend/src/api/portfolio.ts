
import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'
import type { WalletMode } from '../hooks/useWalletMode'

export type PortfolioSummary = {
  currency: string | null
  availableBalance: string
  heldBalance: string
  totalBalance: string
  openPositionCount: number
  tradeCount: number
  netPnl: string
}

export type PortfolioAnalytics = {
  currency: string
  dailyPnl: string
  weeklyPnl: string
  monthlyPnl: string
  wins: number
  losses: number
  winRate: string
  lossRate: string
  tradeCount: number
  volume: string
  averageTrade: string
  series: Array<{ date: string; pnl: string; cumulativePnl: string; tradeCount: number }>
  assets: Array<{ assetId: string; symbol: string; name: string; pnl: string; volume: string; trades: number; wins: number; losses: number }>
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
  summary: (mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<PortfolioSummary>>('/portfolio/summary', { headers: { 'x-wallet-mode': mode } })
      .then((response) => response.data),

  analytics: (mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<PortfolioAnalytics>>('/portfolio/analytics', { headers: { 'x-wallet-mode': mode } })
      .then((response) => response.data),

  positions: (query: { page?: number; pageSize?: number } = {}, mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<PaginatedData<PortfolioPosition>>>('/portfolio/positions' + toQueryString(query), {
        headers: { 'x-wallet-mode': mode },
      })
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const value = params.toString()
  return value ? '?' + value : ''
}
