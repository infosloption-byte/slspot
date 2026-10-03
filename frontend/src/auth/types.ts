import type { ApiSuccess } from '../api/contracts'

export type AuthUser = {
  id: string
  email: string
  status: string
  countryCode: string | null
  emailVerifiedAt: string | null
}

export type AuthSession = AuthUser & {
  sessionId: string
  expiresAt: string
}

export type LoginResponse =
  | { requiresTwoFactor: false; user: AuthSession; expiresAt: string }
  | { requiresTwoFactor: true; user: AuthUser; challengeToken: string; challengeExpiresAt: string }

export type RegistrationVerification = {
  token: string
  expiresAt: string
}

export type RegistrationResponse = {
  accepted: true
  verification?: RegistrationVerification
}

export type PasswordRecoveryResponse = {
  requested: true
  reset?: RegistrationVerification
}

export type VerificationRequestResponse = {
  requested: true
  verification?: RegistrationVerification
}

export type AuthApiSuccess<T> = ApiSuccess<T>
