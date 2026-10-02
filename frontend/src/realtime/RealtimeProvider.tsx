import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { RealtimeClient } from './connection'

const RealtimeContext = createContext<RealtimeClient | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const clientRef = useRef<RealtimeClient | null>(null)

  if (!clientRef.current) {
    clientRef.current = new RealtimeClient()
  }

  const client = clientRef.current

  useEffect(() => {
    if (status === 'authenticated') {
      client.connect()
      return () => client.disconnect()
    }

    client.disconnect()
    return undefined
  }, [client, status])

  const value = useMemo(() => client, [client])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeClient {
  const client = useContext(RealtimeContext)
  if (!client) throw new Error('useRealtime must be used inside RealtimeProvider')
  return client
}
