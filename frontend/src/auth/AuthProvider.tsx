import { useCallback, useEffect, useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import type { AuthSession, LoginResponse, RegistrationResponse } from './types'
import { AuthContext, AUTH_EXPIRED_EVENT, type AuthContextValue } from './context'
import { clearSession, sessionStore, setSession, useSessionStore } from '../state/sessionStore'
import { resetServerPreferences, setServerPreferences } from '../state/preferencesStore'
import { setSoundEnabled } from '../state/tradingUiStore'
import { setDisplayTimeZone } from '../lib/dateTime'

let bootstrapPromise: Promise<AuthSession | null> | null = null

async function hydratePreferences(): Promise<void> {
  try {
    const preferences = await authApi.preferences()
    setServerPreferences(preferences)
    setSoundEnabled(preferences.soundEnabled)
  } catch {
    // Preferences are non-critical; local defaults remain available when the API is unavailable.
  }
}

async function bootstrap(): Promise<AuthSession | null> {
  const current = sessionStore.getState()
  if (current.status !== 'loading') return current.user
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    try {
      const result = await authApi.me()
      setSession(result.user)
      void hydratePreferences()
      return result.user
    } catch {
      clearSession()
      return null
    } finally {
      bootstrapPromise = null
    }
  })()

  return bootstrapPromise
}

async function refreshSession(): Promise<AuthSession | null> {
  try {
    const result = await authApi.me()
    setSession(result.user)
    void hydratePreferences()
    return result.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearSession()
    return null
  }
}

async function login(email: string, password: string, rememberDevice = false): Promise<LoginResponse> {
  const result = await authApi.login({ email, password, rememberDevice })
  if (!result.requiresTwoFactor) {
    setSession(result.user)
    void hydratePreferences()
  }
  return result
}

async function verifyTwoFactor(
  challengeToken: string,
  code?: string,
  recoveryCode?: string,
  rememberDevice = false,
): Promise<LoginResponse> {
  const result = await authApi.verifyTwoFactor({ challengeToken, code, recoveryCode, rememberDevice })
  if (!result.requiresTwoFactor) {
    setSession(result.user)
    void hydratePreferences()
  }
  return result
}

async function register(
  email: string,
  password: string,
  acceptTerms: boolean,
  termsVersion = '2026-10',
): Promise<RegistrationResponse> {
  return authApi.register({ email, password, acceptTerms, termsVersion })
}

async function logout(): Promise<void> {
  await authApi.logout()
  resetServerPreferences()
  clearSession()
}

async function logoutAll(): Promise<void> {
  await authApi.logoutAll()
  resetServerPreferences()
  clearSession()
}

export function AuthProvider({ children }: PropsWithChildren) {
  const current = useSessionStore()
  const profileTimeZone = current.user?.timezone ?? null

  useEffect(() => {
    // Times are shown in the profile timezone when set, otherwise the browser's.
    setDisplayTimeZone(profileTimeZone)
  }, [profileTimeZone])

  useEffect(() => {
    void bootstrap()
  }, [])

  const clear = useCallback(() => {
    resetServerPreferences()
    clearSession()
  }, [])

  useEffect(() => {
    const handleExpired = () => clear()
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [clear])

  const refresh = useCallback(() => refreshSession(), [])
  const handleLogin = useCallback((email: string, password: string, rememberDevice?: boolean) => login(email, password, rememberDevice), [])
  const handleTwoFactor = useCallback((challengeToken: string, code?: string, recoveryCode?: string, rememberDevice?: boolean) => verifyTwoFactor(challengeToken, code, recoveryCode, rememberDevice), [])
  const handleRegister = useCallback((email: string, password: string, acceptTerms: boolean, termsVersion?: string) => register(email, password, acceptTerms, termsVersion), [])
  const handleLogout = useCallback(() => logout(), [])
  const handleLogoutAll = useCallback(() => logoutAll(), [])

  const value = useMemo<AuthContextValue>(() => ({
    status: current.status,
    user: current.user,
    isAuthenticated: current.status === 'authenticated',
    refresh,
    login: handleLogin,
    verifyTwoFactor: handleTwoFactor,
    register: handleRegister,
    logout: handleLogout,
    logoutAll: handleLogoutAll,
  }), [current, refresh, handleLogin, handleTwoFactor, handleRegister, handleLogout, handleLogoutAll])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
