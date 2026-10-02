import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import type { AuthSession, RegistrationResponse } from './types'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  status: AuthStatus
  user: AuthSession | null
  isAuthenticated: boolean
  refresh: () => Promise<AuthSession | null>
  login: (email: string, password: string) => Promise<AuthSession>
  register: (email: string, password: string) => Promise<RegistrationResponse>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_EXPIRED_EVENT = 'slspot:auth-expired'

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthSession | null>(null)

  const clearSession = useCallback(() => {
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const result = await authApi.me()
      setUser(result.user)
      setStatus('authenticated')
      return result.user
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession()
        return null
      }

      setStatus((current) => current === 'loading' ? 'unauthenticated' : current)
      return null
    }
  }, [clearSession])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleExpired = () => clearSession()
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password })
    setUser(result.user)
    setStatus('authenticated')
    return result.user
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    return authApi.register({ email, password })
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    clearSession()
  }, [clearSession])

  const logoutAll = useCallback(async () => {
    await authApi.logoutAll()
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    isAuthenticated: status === 'authenticated',
    refresh,
    login,
    register,
    logout,
    logoutAll,
  }), [status, user, refresh, login, register, logout, logoutAll])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}

export { AUTH_EXPIRED_EVENT }
