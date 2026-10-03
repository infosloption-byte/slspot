import { createContext } from 'react'
import type { AuthSession, LoginResponse, RegistrationResponse } from './types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  status: AuthStatus
  user: AuthSession | null
  isAuthenticated: boolean
  refresh: () => Promise<AuthSession | null>
  login: (email: string, password: string, rememberDevice?: boolean) => Promise<LoginResponse>
  verifyTwoFactor: (challengeToken: string, code?: string, recoveryCode?: string, rememberDevice?: boolean) => Promise<LoginResponse>
  register: (email: string, password: string, acceptTerms: boolean, termsVersion?: string) => Promise<RegistrationResponse>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const AUTH_EXPIRED_EVENT = 'slspot:auth-expired'
