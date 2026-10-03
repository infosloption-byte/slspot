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

export type WalletTransactionFilters = {
  search?: string
  type?: WalletTransaction['type']
  status?: WalletTransaction['status']
  from?: string
  to?: string
}

export type FundingResult = {
  id: string
  type: 'DEPOSIT' | 'WITHDRAWAL'
  status: string
  amount: string
  currency: string
  walletId: string
  walletTransactionId: string | null
  provider: string
  providerReference: string | null
  destination?: string | null
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
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

  transactions: (query: { page?: number; pageSize?: number } & WalletTransactionFilters = {}, mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiSuccess<PaginatedData<WalletTransaction>>>(
        '/wallet/transactions' + toQueryString(query),
        { headers: { 'x-wallet-mode': mode } },
      )
      .then((response) => response.data),

  deposit: (input: { amount: string; clientRequestId: string }, mode: WalletMode = 'DEMO') =>
    apiClient
      .post<ApiSuccess<FundingResult>>('/wallet/deposit', input, {
        idempotencyKey: input.clientRequestId,
        headers: { 'x-wallet-mode': mode },
      })
      .then((response) => response.data),

  withdraw: (input: { amount: string; destination: string; clientRequestId: string }, mode: WalletMode = 'DEMO') =>
    apiClient
      .post<ApiSuccess<FundingResult>>('/wallet/withdraw', input, {
        idempotencyKey: input.clientRequestId,
        headers: { 'x-wallet-mode': mode },
      })
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number } & WalletTransactionFilters): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.type) params.set('type', query.type)
  if (query.status) params.set('status', query.status)
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  const value = params.toString()
  return value ? '?' + value : ''
}
