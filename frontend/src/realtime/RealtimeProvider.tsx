import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { RealtimeContext } from './useRealtime'
import { RealtimeClient } from './connection'

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

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>
}
