import { useCallback } from 'react'
import { authApi } from '../api/auth'
import { marketApi } from '../api/market'
import { notificationsApi } from '../api/notifications'
import { portfolioApi } from '../api/portfolio'
import { tradesApi, type TradeRecord } from '../api/trades'
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
  const load = useCallback(() => portfolioApi.summary(), [])
  return useAsyncResource(load)
}

export function usePortfolioPositions(page: number, pageSize = 25) {
  const load = useCallback(() => portfolioApi.positions({ page, pageSize }), [page, pageSize])
  return useAsyncResource(load)
}

export function useTrades(page: number, pageSize = 25, status?: TradeRecord['status']) {
  const load = useCallback(() => tradesApi.list({ page, pageSize, status }), [page, pageSize, status])
  return useAsyncResource(load)
}

export function useWallet() {
  const load = useCallback(() => walletApi.get(), [])
  return useAsyncResource(load)
}

export function useWalletTransactions(page: number, pageSize = 25) {
  const load = useCallback(() => walletApi.transactions({ page, pageSize }), [page, pageSize])
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
