export type ApiSuccess<T> = {
  success: true
  data: T
  requestId: string
}

export type ApiErrorResponse = {
  success: false
  error: {
    code: string
    message: string
  }
  requestId: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse

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
