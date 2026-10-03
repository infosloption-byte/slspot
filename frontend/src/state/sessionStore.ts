import { createStore, useStore } from './createStore'
import type { AuthStatus } from '../auth/context'
import type { AuthSession } from '../auth/types'

export type SessionState = {
  status: AuthStatus
  user: AuthSession | null
}

export const sessionStore = createStore<SessionState>({ status: 'loading', user: null })

export function useSessionStore(): SessionState {
  return useStore(sessionStore)
}

export function setSession(user: AuthSession): void {
  sessionStore.setState({ status: 'authenticated', user })
}

export function clearSession(): void {
  sessionStore.setState({ status: 'unauthenticated', user: null })
}
