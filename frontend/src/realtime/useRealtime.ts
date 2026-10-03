import { createContext, useContext, useSyncExternalStore } from 'react'
import { RealtimeClient, type RealtimeConnectionState } from './connection'

export const RealtimeContext = createContext<RealtimeClient | null>(null)

export function useRealtime(): RealtimeClient {
  const client = useContext(RealtimeContext)
  if (!client) throw new Error('useRealtime must be used inside RealtimeProvider')
  return client
}

export function useRealtimeState(): RealtimeConnectionState {
  const client = useRealtime()

  return useSyncExternalStore(
    (listener) => client.onStateChange(listener),
    () => client.state,
    () => 'idle',
  )
}
