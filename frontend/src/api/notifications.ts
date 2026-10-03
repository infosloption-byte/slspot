import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

export type NotificationRecord = {
  id: string
  type: 'TRADE_RESULT' | 'DEPOSIT' | 'WITHDRAWAL' | 'SECURITY' | 'VERIFICATION' | 'SYSTEM'
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export const notificationsApi = {
  list: (query: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}) =>
    apiClient
      .get<ApiSuccess<PaginatedData<NotificationRecord>>>('/notifications' + toQueryString(query))
      .then((response) => response.data),

  markRead: (notificationId: string) =>
    apiClient
      .post<ApiSuccess<{ read: boolean }>>('/notifications/' + notificationId + '/read')
      .then((response) => response.data),

  markAllRead: () =>
    apiClient
      .post<ApiSuccess<{ updated: number }>>('/notifications/read-all')
      .then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number; unreadOnly?: boolean }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  if (query.unreadOnly !== undefined) params.set('unreadOnly', String(query.unreadOnly))
  const value = params.toString()
  return value ? '?' + value : ''
}
