import { apiClient } from './client'
import type { ApiSuccess, PaginatedData } from './contracts'

export type SupportCategory = 'ACCOUNT' | 'TRADING' | 'WALLET' | 'TECHNICAL' | 'OTHER'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'

export type SupportTicket = {
  id: string
  subject: string
  category: SupportCategory
  status: SupportTicketStatus
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messageCount: number
}

export type SupportMessage = {
  id: string
  body: string
  createdAt: string
  author: {
    id: string
    displayName: string | null
    email: string
    admin: boolean
  }
}

export type SupportTicketDetail = SupportTicket & {
  messages: SupportMessage[]
}

export const supportApi = {
  list: (query: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<ApiSuccess<PaginatedData<SupportTicket>>>('/support/tickets' + toQueryString(query)).then((response) => response.data),

  get: (ticketId: string) =>
    apiClient.get<ApiSuccess<SupportTicketDetail>>('/support/tickets/' + encodeURIComponent(ticketId)).then((response) => response.data),

  create: (input: { subject: string; category: SupportCategory; body: string }) =>
    apiClient.post<ApiSuccess<SupportTicketDetail>>('/support/tickets', input).then((response) => response.data),

  reply: (ticketId: string, body: string) =>
    apiClient.post<ApiSuccess<SupportTicketDetail>>('/support/tickets/' + encodeURIComponent(ticketId) + '/messages', { body }).then((response) => response.data),

  close: (ticketId: string) =>
    apiClient.post<ApiSuccess<SupportTicketDetail>>('/support/tickets/' + encodeURIComponent(ticketId) + '/close').then((response) => response.data),
}

function toQueryString(query: { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const value = params.toString()
  return value ? '?' + value : ''
}
