import { useCallback, useEffect } from 'react'
import { useWalletMode } from './useWalletMode'
import { authApi, type AccountCapabilities } from '../api/auth'
import { marketApi } from '../api/market'
import { notificationsApi } from '../api/notifications'
import { portfolioApi } from '../api/portfolio'
import { supportApi } from '../api/support'
import type { WalletTransactionFilters } from '../api/wallet'
import { tradesApi, type TradeHistorySortBy, type TradeHistorySortOrder, type TradeRecord } from '../api/trades'
import { walletApi } from '../api/wallet'
import { useAsyncResource } from './useAsyncResource'
import { setPortfolioAnalytics, setPortfolioPositions, setPortfolioSummary } from '../state/portfolioStore'

export function useTradingCapabilities() {
  const load = useCallback(() => authApi.capabilities(), [])
  return useAsyncResource<AccountCapabilities>(load)
}

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
  return useAsyncResource(load, Boolean(assetId), assetId + ':' + interval)
}

export function usePortfolioSummary() {
  const { mode } = useWalletMode()
  const load = useCallback(() => portfolioApi.summary(mode), [mode])
  const resource = useAsyncResource(load, true, mode)
  useEffect(() => { if (resource.data) setPortfolioSummary(resource.data) }, [resource.data])
  return resource
}

export function usePortfolioAnalytics() {
  const { mode } = useWalletMode()
  const load = useCallback(() => portfolioApi.analytics(mode), [mode])
  const resource = useAsyncResource(load, true, mode)
  useEffect(() => { if (resource.data) setPortfolioAnalytics(resource.data) }, [resource.data])
  return resource
}

export function usePortfolioPositions(page: number, pageSize = 25) {
  const { mode } = useWalletMode()
  const load = useCallback(() => portfolioApi.positions({ page, pageSize }, mode), [page, pageSize, mode])
  const resource = useAsyncResource(load, true, mode)
  useEffect(() => { if (resource.data) setPortfolioPositions(resource.data.items) }, [resource.data])
  return resource
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
  return useAsyncResource(load, true, mode)
}

export function useWallet() {
  const { mode } = useWalletMode()
  const load = useCallback(() => walletApi.get(mode), [mode])
  return useAsyncResource(load, true, mode)
}

export function useWallets() {
  const load = useCallback(() => walletApi.list(), [])
  return useAsyncResource(load)
}

export function useWalletTransactions(
  page: number,
  pageSize = 25,
  filters: WalletTransactionFilters = {},
) {
  const { mode } = useWalletMode()
  const { search, type, status, from, to } = filters
  const load = useCallback(
    () => walletApi.transactions({ page, pageSize, search, type, status, from, to }, mode),
    [page, pageSize, search, type, status, from, to, mode],
  )
  return useAsyncResource(load, true, mode)
}

export function useAuthPreferences() {
  const load = useCallback(() => authApi.preferences(), [])
  return useAsyncResource(load)
}

export function useSupportTickets(page: number, pageSize = 25) {
  const load = useCallback(() => supportApi.list({ page, pageSize }), [page, pageSize])
  return useAsyncResource(load)
}

export function useSupportTicket(ticketId: string | null) {
  const load = useCallback(
    () => ticketId ? supportApi.get(ticketId) : Promise.reject(new Error('No support ticket selected')),
    [ticketId],
  )
  return useAsyncResource(load, Boolean(ticketId), ticketId ?? '')
}

export function useNotifications(page: number, pageSize = 25, unreadOnly = false) {
  const load = useCallback(() => notificationsApi.list({ page, pageSize, unreadOnly }), [page, pageSize, unreadOnly])
  return useAsyncResource(load)
}

export function useAuthSessions() {
  const load = useCallback(() => authApi.sessions(), [])
  return useAsyncResource(load)
}

export function useTwoFactorStatus() {
  const load = useCallback(() => authApi.twoFactorStatus(), [])
  return useAsyncResource(load)
}

export function useAuthDevices() {
  const load = useCallback(() => authApi.devices(), [])
  return useAsyncResource(load)
}

export function useLoginHistory() {
  const load = useCallback(() => authApi.loginHistory(), [])
  return useAsyncResource(load)
}

export function useSecurityEvents() {
  const load = useCallback(() => authApi.securityEvents(), [])
  return useAsyncResource(load)
}
