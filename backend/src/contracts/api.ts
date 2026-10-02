export const API_VERSION = 'v1' as const
export const API_PREFIX = '/api/v1' as const

export const API_HEADERS = {
  requestId: 'x-request-id',
  idempotencyKey: 'idempotency-key',
} as const

export const MAX_IDEMPOTENCY_KEY_LENGTH = 128

export type ApiSuccess<T> = {
  success: true
  data: T
  requestId: string
}

export type ApiError = {
  success: false
  error: {
    code: string
    message: string
  }
  requestId: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export type Pagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type PaginatedData<T> = {
  items: T[]
  pagination: Pagination
}

export type ApiQuery = {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filter?: string
}

export type MarketStatus = 'open' | 'closed' | 'preopen' | 'maintenance' | 'halted'

export type MarketPrice = {
  assetId: string
  symbol: string
  bid: string
  ask: string
  last: string
  changePct: string
  timestamp: string
}

export type MarketCandle = {
  assetId: string
  symbol: string
  interval: string
  openTime: string
  closeTime: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDEMPOTENCY_KEY_LENGTH
}
