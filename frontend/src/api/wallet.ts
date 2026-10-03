import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'
import type { WalletMode } from '../hooks/useWalletMode'

export type WalletSnapshot = {
  id: string
  accountId: string
  mode: WalletMode
  name: string
  currency: string
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  availableBalance: string
  heldBalance: string
  totalBalance: string
}

export type WalletTransaction = {
  id: string
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_HOLD' | 'TRADE_RELEASE' | 'SETTLEMENT' | 'FEE' | 'ADJUSTMENT'
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED'
  amount: string
  currency: string
  referenceType: string | null
  referenceId: string | null
  description: string | null
  createdAt: string
}

export const walletApi = {
  list: () =>
    apiClient
      .get<ApiSuccess<WalletSnapshot[]>>('/wallets')
      .then((response) => response.data),

  get: (mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<WalletSnapshot | null>>('/wallet', { headers: { 'x-wallet-mode': mode } })
      .then((response) => response.data),

  transactions: (query: { page?: number; pageSize?: number } = {}, mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<PaginatedData<WalletTransaction>>>(
        '/wallet/transactions' + toQueryString(query),
        { headers: { 'x-wallet-mode': mode } },
      )
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const value = params.toString()
  return value ? '?' + value : ''
}
