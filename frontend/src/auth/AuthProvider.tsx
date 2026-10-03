import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { PropsWithChildren } from 'react'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import type { AuthSession, LoginResponse, RegistrationResponse } from './types'
import { AuthContext, AUTH_EXPIRED_EVENT, type AuthContextValue, type AuthStatus } from './context'

type AuthSnapshot = {
  status: AuthStatus
  user: AuthSession | null
}

let snapshot: AuthSnapshot = {
  status: 'loading',
  user: null,
}

const listeners = new Set<() => void>()
let bootstrapPromise: Promise<AuthSession | null> | null = null

function emit(next: AuthSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

const authStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot(): AuthSnapshot {
    return snapshot
  },

  clear(): void {
    emit({ status: 'unauthenticated', user: null })
  },

  async bootstrap(): Promise<AuthSession | null> {
    if (snapshot.status !== 'loading') return snapshot.user
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      try {
        const result = await authApi.me()
        emit({ status: 'authenticated', user: result.user })
        return result.user
      } catch {
        emit({ status: 'unauthenticated', user: null })
        return null
      } finally {
        bootstrapPromise = null
      }
    })()

    return bootstrapPromise
  },

  async refresh(): Promise<AuthSession | null> {
    try {
      const result = await authApi.me()
      emit({ status: 'authenticated', user: result.user })
      return result.user
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        emit({ status: 'unauthenticated', user: null })
      }
      return null
    }
  },

  async login(email: string, password: string, rememberDevice = false): Promise<LoginResponse> {
    const result = await authApi.login({ email, password, rememberDevice })
    if (!result.requiresTwoFactor) emit({ status: 'authenticated', user: result.user })
    return result
  },

  async verifyTwoFactor(challengeToken: string, code?: string, recoveryCode?: string, rememberDevice = false): Promise<LoginResponse> {
    const result = await authApi.verifyTwoFactor({ challengeToken, code, recoveryCode, rememberDevice })
    if (!result.requiresTwoFactor) emit({ status: 'authenticated', user: result.user })
    return result
  },

  async register(email: string, password: string, acceptTerms: boolean, termsVersion = '2026-10'): Promise<RegistrationResponse> {
    return authApi.register({ email, password, acceptTerms, termsVersion })
  },

  async logout(): Promise<void> {
    await authApi.logout()
    authStore.clear()
  },

  async logoutAll(): Promise<void> {
    await authApi.logoutAll()
    authStore.clear()
  },
}

export function AuthProvider({ children }: PropsWithChildren) {
  const current = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot,
  )

  useEffect(() => {
    void authStore.bootstrap()
  }, [])

  const clearSession = useCallback(() => authStore.clear(), [])

  useEffect(() => {
    const handleExpired = () => clearSession()
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [clearSession])

  const refresh = useCallback(() => authStore.refresh(), [])
  const login = useCallback((email: string, password: string, rememberDevice?: boolean) => authStore.login(email, password, rememberDevice), [])
  const verifyTwoFactor = useCallback((challengeToken: string, code?: string, recoveryCode?: string, rememberDevice?: boolean) => authStore.verifyTwoFactor(challengeToken, code, recoveryCode, rememberDevice), [])
  const register = useCallback((email: string, password: string, acceptTerms: boolean, termsVersion?: string) => authStore.register(email, password, acceptTerms, termsVersion), [])
  const logout = useCallback(() => authStore.logout(), [])
  const logoutAll = useCallback(() => authStore.logoutAll(), [])

  const value = useMemo<AuthContextValue>(() => ({
    status: current.status,
    user: current.user,
    isAuthenticated: current.status === 'authenticated',
    refresh,
    login,
    verifyTwoFactor,
    register,
    logout,
    logoutAll,
  }), [current, refresh, login, verifyTwoFactor, register, logout, logoutAll])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

