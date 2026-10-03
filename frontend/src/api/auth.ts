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
  deviceId: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}


export type AuthDeviceRecord = {
  id: string
  deviceName: string | null
  userAgent: string | null
  lastSeenAt: string
  createdAt: string
}

export type TwoFactorStatus = {
  enabled: boolean
  recoveryCodesRemaining: number
}

export type TwoFactorSetup = {
  enabled: boolean
  secret: string
  otpauthUri: string
}

export type LoginHistoryRecord = {
  id: string
  action: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  metadata: unknown
}

export type SecurityEventRecord = LoginHistoryRecord & {
  entityType: string
  entityId: string | null
}

export const authApi = {
  register: (input: { email: string; password: string; countryCode?: string; acceptTerms: boolean; termsVersion?: string }) =>
    apiClient.post<ApiSuccess<RegistrationResponse>>('/auth/register', input).then(data),

  login: (input: { email: string; password: string; rememberDevice?: boolean }) =>
    apiClient.post<ApiSuccess<LoginResponse>>('/auth/login', input).then(data),

  verifyTwoFactor: (input: { challengeToken: string; code?: string; recoveryCode?: string; rememberDevice?: boolean }) =>
    apiClient.post<ApiSuccess<LoginResponse>>('/auth/2fa/verify', input).then(data),

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

  twoFactorStatus: () =>
    apiClient.get<ApiSuccess<TwoFactorStatus>>('/auth/2fa/status').then(data),

  setupTwoFactor: () =>
    apiClient.post<ApiSuccess<TwoFactorSetup>>('/auth/2fa/setup').then(data),

  enableTwoFactor: (code: string) =>
    apiClient.post<ApiSuccess<{ enabled: true; recoveryCodes: string[] }>>('/auth/2fa/enable', { code }).then(data),

  disableTwoFactor: (code: string) =>
    apiClient.post<ApiSuccess<{ disabled: boolean }>>('/auth/2fa/disable', { code }).then(data),

  devices: () =>
    apiClient.get<ApiSuccess<{ devices: AuthDeviceRecord[] }>>('/auth/devices').then(data),

  loginHistory: () =>
    apiClient.get<ApiSuccess<{ items: LoginHistoryRecord[] }>>('/auth/login-history').then(data),

  securityEvents: () =>
    apiClient.get<ApiSuccess<{ items: SecurityEventRecord[] }>>('/auth/security-events').then(data),

  verifyEmail: (token: string) =>
    apiClient.post<ApiSuccess<{ user: AuthUser }>>('/auth/verify-email', { token }).then(data),

  requestEmailVerification: (email: string) =>
    apiClient.post<ApiSuccess<VerificationRequestResponse>>('/auth/verify-email/request', { email }).then(data),

  forgotPassword: (email: string) =>
    apiClient.post<ApiSuccess<PasswordRecoveryResponse>>('/auth/forgot-password', { email }).then(data),

  resetPassword: (token: string, password: string) =>
    apiClient.post<ApiSuccess<{ reset: boolean }>>('/auth/reset-password', { token, password }).then(data),
}
