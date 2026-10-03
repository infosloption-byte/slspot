
import { apiClient } from './client'
import type { PaginatedData } from './contracts'
import type { WalletMode } from '../hooks/useWalletMode'

type ApiEnvelope<T> = {
  success: true
  data: T
  requestId: string
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

export type TradeCreateResult = {
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
}

export type TradeCloseResult = {
  orderId?: string
  tradeId: string
  positionId?: string
  status: string
  direction?: 'UP' | 'DOWN'
  amount?: string
  entryPrice?: string
  exitPrice?: string | null
  payoutRate?: string
  fee?: string
  grossPnl: string | null
  netPnl: string | null
  openedAt?: string
  closedAt?: string | null
  expiresAt?: string | null
  settlementId: string | null
  settlementPrice: string | null
  settlementReference?: string | null
}

function unwrap<T>(response: ApiEnvelope<T>): T {
  return response.data
}

export const tradesApi = {
  list: (query: { page?: number; pageSize?: number; status?: TradeRecord['status'] } = {}, mode: WalletMode = 'DEMO') =>
    apiClient
      .get<ApiEnvelope<PaginatedData<TradeRecord>>>('/trades' + toQueryString(query), {
        headers: { 'x-wallet-mode': mode },
      })
      .then(unwrap),

  create: (input: {
    assetId: string
    direction: 'UP' | 'DOWN'
    amount: string
    durationSeconds: number
    clientRequestId: string
  }, mode: WalletMode = 'DEMO'): Promise<TradeCreateResult> =>
    apiClient
      .post<ApiEnvelope<TradeCreateResult>>('/trades', input, {
        idempotencyKey: input.clientRequestId,
        headers: { 'x-wallet-mode': mode },
      })
      .then(unwrap),

  close: (tradeId: string, mode: WalletMode = 'DEMO'): Promise<TradeCloseResult> =>
    apiClient
      .post<ApiEnvelope<TradeCloseResult>>(
        '/trades/' + encodeURIComponent(tradeId) + '/close',
        undefined,
        { headers: { 'x-wallet-mode': mode } },
      )
      .then(unwrap),
}

function toQueryString(query: { page?: number; pageSize?: number; status?: string }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.status) params.set('status', query.status)
  const value = params.toString()
  return value ? '?' + value : ''
}
