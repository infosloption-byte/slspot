import { useCallback } from 'react'
import { useWalletMode } from './useWalletMode'
import { authApi } from '../api/auth'
import { marketApi } from '../api/market'
import { notificationsApi } from '../api/notifications'
import { portfolioApi } from '../api/portfolio'
import { tradesApi, type TradeHistorySortBy, type TradeHistorySortOrder, type TradeRecord } from '../api/trades'
import { walletApi } from '../api/wallet'
import { useAsyncResource } from './useAsyncResource'

export function useMarketAssets(pageSize = 100) {
  const load = useCallback(() => marketApi.listAssets({ pageSize }), [pageSize])
  return useAsyncResource(load)
}

export function useMarketCandles(assetId: string | undefined, interval: string, limit = 200) {
  const load = useCallback(
    () => assetId
      ? marketApi.candles(assetId, { interval, limit })
      : Promise.reject(new Error('No market asset selected')),
    [assetId, interval, limit],
  )
  return useAsyncResource(load, Boolean(assetId))
}

export function usePortfolioSummary() {
  const { mode } = useWalletMode()
  const load = useCallback(() => portfolioApi.summary(mode), [mode])
  return useAsyncResource(load)
}

export function usePortfolioPositions(page: number, pageSize = 25) {
  const { mode } = useWalletMode()
  const load = useCallback(() => portfolioApi.positions({ page, pageSize }, mode), [page, pageSize, mode])
  return useAsyncResource(load)
}

export type TradeHistoryQuery = {
  status?: string
  search?: string
  assetId?: string
  direction?: 'UP' | 'DOWN'
  from?: string
  to?: string
  sortBy?: TradeHistorySortBy
  sortOrder?: TradeHistorySortOrder
  settledOnly?: boolean
}

export function useTrades(page: number, pageSize = 25, status?: TradeRecord['status'], filters: TradeHistoryQuery = {}) {
  const { mode } = useWalletMode()
  const { status: filterStatus, search, assetId, direction, from, to, sortBy, sortOrder, settledOnly } = filters
  const load = useCallback(
    () => tradesApi.list({ page, pageSize, status: status ?? filterStatus, search, assetId, direction, from, to, sortBy, sortOrder, settledOnly }, mode),
    [page, pageSize, status, filterStatus, search, assetId, direction, from, to, sortBy, sortOrder, settledOnly, mode],
  )
  return useAsyncResource(load)
}

export function useWallet() {
  const { mode } = useWalletMode()
  const load = useCallback(() => walletApi.get(mode), [mode])
  return useAsyncResource(load)
}

export function useWallets() {
  const load = useCallback(() => walletApi.list(), [])
  return useAsyncResource(load)
}

export function useWalletTransactions(page: number, pageSize = 25) {
  const { mode } = useWalletMode()
  const load = useCallback(() => walletApi.transactions({ page, pageSize }, mode), [page, pageSize, mode])
  return useAsyncResource(load)
}

export function useNotifications(page: number, pageSize = 25, unreadOnly = false) {
  const load = useCallback(() => notificationsApi.list({ page, pageSize, unreadOnly }), [page, pageSize, unreadOnly])
  return useAsyncResource(load)
}

export function useAuthSessions() {
  const load = useCallback(() => authApi.sessions(), [])
  return useAsyncResource(load)
}
