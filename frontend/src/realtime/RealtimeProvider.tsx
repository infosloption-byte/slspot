import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { RealtimeClient, type RealtimeConnectionState } from './connection'

const RealtimeContext = createContext<RealtimeClient | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [client] = useState(() => new RealtimeClient())

  useEffect(() => {
    if (status !== 'authenticated') {
      client.disconnect()
      return undefined
    }

    client.connect()
    return () => client.disconnect()
  }, [client, status])

  const value = useMemo(() => client, [client])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

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
