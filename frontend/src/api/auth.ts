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

export type UserPreferences = {
  compactTradingLayout: boolean
  priceMovementAlerts: boolean
  soundEnabled: boolean
  emailTradeResults: boolean
  emailWalletUpdates: boolean
  emailSecurityAlerts: boolean
  emailAnnouncements: boolean
  emailSupportUpdates: boolean
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

export type Capability = {
  enabled: boolean
  reason: string | null
}

export type AccountCapabilities = {
  trading: {
    DEMO: Capability
    REAL: Capability
  }
  funding: {
    deposit: {
      DEMO: Capability
      REAL: Capability
    }
    withdrawal: {
      DEMO: Capability
      REAL: Capability
    }
  }
}

export type SecurityEventRecord = LoginHistoryRecord & {
  entityType: string
  entityId: string | null
}

export const authApi = {
  register: (input: { email: string; password: string; countryCode?: string; acceptTerms: boolean; acknowledgePrivacy: boolean; termsVersion: string; privacyVersion: string }) =>
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

  profile: () =>
    apiClient.get<ApiSuccess<{ user: AuthUser }>>('/auth/me').then(data),

  updateProfile: (input: { displayName?: string | null; countryCode?: string | null; timezone?: string | null; locale?: string | null; legalName?: string | null; dateOfBirth?: string | null }) =>
    apiClient.patch<ApiSuccess<{ user: AuthUser }>>('/auth/profile', input).then(data),

  preferences: () =>
    apiClient.get<ApiSuccess<UserPreferences>>('/auth/preferences').then(data),

  updatePreferences: (input: Partial<UserPreferences>) =>
    apiClient.patch<ApiSuccess<UserPreferences>>('/auth/preferences', input).then(data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<ApiSuccess<{ changed: boolean }>>('/auth/password/change', { currentPassword, newPassword }).then(data),

  capabilities: () =>
    apiClient.get<ApiSuccess<AccountCapabilities>>('/auth/capabilities').then(data),

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
