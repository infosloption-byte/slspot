import { apiClient } from './client'
import type {
  AuthSession,
  AuthUser,
  LoginResponse,
  PasswordRecoveryResponse,
  RegistrationResponse,
  VerificationRequestResponse,
} from '../auth/types'
import type { ApiSuccess } from './contracts'

function data<T>(response: ApiSuccess<T>): T {
  return response.data
}

export type AuthSessionRecord = {
  id: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

export const authApi = {
  register: (input: { email: string; password: string; countryCode?: string }) =>
    apiClient.post<ApiSuccess<RegistrationResponse>>('/auth/register', input).then(data),

  login: (input: { email: string; password: string }) =>
    apiClient.post<ApiSuccess<LoginResponse>>('/auth/login', input).then(data),

  logout: () =>
    apiClient.post<ApiSuccess<{ loggedOut: boolean }>>('/auth/logout').then(data),

  logoutAll: () =>
    apiClient.post<ApiSuccess<{ loggedOut: boolean }>>('/auth/logout-all').then(data),

  me: () =>
    apiClient.get<ApiSuccess<{ user: AuthSession; sessionId: string }>>('/auth/me').then(data),

  sessions: () =>
    apiClient.get<ApiSuccess<{ sessions: AuthSessionRecord[] }>>('/auth/sessions').then(data),

  revokeSession: (sessionId: string) =>
    apiClient.delete<ApiSuccess<{ revoked: boolean }>>('/auth/sessions/' + sessionId).then(data),

  verifyEmail: (token: string) =>
    apiClient.post<ApiSuccess<{ user: AuthUser }>>('/auth/verify-email', { token }).then(data),

  requestEmailVerification: (email: string) =>
    apiClient.post<ApiSuccess<VerificationRequestResponse>>('/auth/verify-email/request', { email }).then(data),

  forgotPassword: (email: string) =>
    apiClient.post<ApiSuccess<PasswordRecoveryResponse>>('/auth/forgot-password', { email }).then(data),

  resetPassword: (token: string, password: string) =>
    apiClient.post<ApiSuccess<{ reset: boolean }>>('/auth/reset-password', { token, password }).then(data),
}
